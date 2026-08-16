import { createInterface } from "node:readline";
import path from "node:path";
import { cp, mkdir, readdir, realpath, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  discoverClientRoots,
  ensureBuiltinGroups,
  initializeStoreLayout,
  readPointerStoreRoot,
  readSkillMeta,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { POINTER_REL, runAdopt } from "./store-cmds.js";
import { DEFAULT_UI_PORT, startUiServer } from "./ui-server.js";

/**
 * bootstrap:真机一键体验——交互确认(库存位置/备份/迁移)→ 备份 → 收录全部本机 skills → 自动启动面板。
 * 幂等:库存已配置时跳过全部交互,直接启动面板。
 * 写操作铁律不变:交互中的 Y 即显式授权;非 TTY 且无 --yes 拒绝执行。
 */

const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function warn(text: string): void {
  console.error(RED + BOLD + text + RESET);
}

export interface BootstrapArgs {
  /** --home:库存根/基座(默认 ~/.skills-hub) */
  home?: string;
  /** --port:面板端口 */
  port?: number;
  /** --yes:非交互环境显式授权全部写操作 */
  yes?: boolean;
}

export interface BootstrapOptions {
  /** 测试注入:问答实现;缺省用 stdin readline */
  readLine?: (prompt: string) => Promise<string>;
  /** 测试注入:结束时是否启动 ui 服务(默认 true) */
  ui?: boolean;
}

async function defaultReadLine(): Promise<(prompt: string) => Promise<string>> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string) => new Promise<string>((resolve) => rl.question(prompt, resolve));
  return ask;
}

/** 指针文件:tmp+rename 原子写(与 init 同款)。 */
async function writePointerFile(home: string, storeRoot: string): Promise<void> {
  const pointerFile = path.join(home, POINTER_REL);
  await mkdir(path.dirname(pointerFile), { recursive: true });
  const tmp = pointerFile + ".tmp-" + process.pid + "-" + Date.now();
  await writeFile(tmp, JSON.stringify({ storeRoot }, null, 2) + "\n", "utf8");
  await rename(tmp, pointerFile);
}

/** 备份:把全部客户端 skills 目录复制到 <库存根>/backups/<时间戳>/roots/<clientId>/<rel>/。 */
export async function backupAllClientSkills(
  baseHome: string,
  backupRoot: string,
): Promise<{ snapshotId: string; clientRoots: number; skillDirs: number; backupDir: string }> {
  // 快照 ID:毫秒时间戳 + 随机后缀,避免同一毫秒多次调用碰撞(CI 上实测踩到)。
  const snapshotId = new Date().toISOString().replace(/[:]/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
  const destBase = path.join(backupRoot, snapshotId, "roots");
  await mkdir(destBase, { recursive: true }); // 显式建目录:roots 为空或 cp 未建父目录时 manifest 也能写
  // discoverClientRoots 内部对 skillsDir 做了 realpath(展开 8.3 短名/符号链接),
  // 基准也必须 realpath,否则 relative 会以 ".." 开头误判越界(CI runner 上实测踩到)。
  const realBase = await realpath(baseHome).catch(() => baseHome);
  const roots = await discoverClientRoots(baseHome);
  let skillDirs = 0;
  for (const root of roots) {
    // 相对路径保留原始形态(如 .claude/skills),不做任何字符串裁剪——之前用
    // /^\.\.?[/\\]?/ 替换会误删 .claude 开头的点,把备份结构搞错。
    const rel = path.relative(realBase, root.skillsDir).split(path.sep).join("/");
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue; // 防御:skillsDir 不在 baseHome 下则跳过
    const dest = path.join(destBase, root.clientId, rel);
    await cp(root.skillsDir, dest, { recursive: true, force: true });
    skillDirs += 1;
  }
  await writeFile(
    path.join(backupRoot, snapshotId, "manifest.json"),
    JSON.stringify({ snapshotId, createdAt: new Date().toISOString(), clientRoots: roots.length, skillDirs }, null, 2) + "\n",
  );
  return { snapshotId, clientRoots: roots.length, skillDirs, backupDir: destBase };
}

/** 发现并收录:扫描 base 下全部客户端 root,收集达标 skill 目录,一次批量 adopt。 */
export async function migrateAllSkills(
  baseHome: string,
  storeRoot: string,
): Promise<{ discovered: number; adopted: number; dryRun: boolean }> {
  await initializeStoreLayout(storeRoot);
  await ensureBuiltinGroups(storeRoot);
  await writePointerFile(storeRoot, storeRoot);
  const roots = await discoverClientRoots(baseHome);
  const dirs: string[] = [];
  for (const root of roots) {
    let entries;
    try { entries = await readdir(root.skillsDir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const fp = path.join(root.skillsDir, e.name);
      if ((await readSkillMeta(fp)) !== null) dirs.push(fp);
    }
  }
  const discovered = dirs.length;
  if (dirs.length === 0) return { discovered, adopted: 0, dryRun: false };
  await runAdopt({ _: dirs, home: storeRoot, yes: true, dryRun: false, json: false });
  return { discovered, adopted: dirs.length, dryRun: false };
}

/** 打开默认浏览器(Windows start;失败静默,不阻塞)。 */
function openBrowser(url: string): void {
  try {
    const child = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // 打不开浏览器不影响面板服务本身
  }
}

export async function runBootstrap(args: BootstrapArgs, opts: BootstrapOptions = {}): Promise<void> {
  const port = args.port ?? DEFAULT_UI_PORT;
  const base = resolveHome(args.home);
  // 幂等检测:读指针文件(注意不能用 resolveStoreRoot 的 cliHome 直通——它永远 ok)。
  const existingRoot = await readPointerStoreRoot(path.join(base, POINTER_REL));

  if (existingRoot !== null) {
    console.log("库存已就绪:" + existingRoot + " — 跳过初始化,直接启动面板。");
    if (opts.ui !== false) {
      await startUiServer(port, base);
      openBrowser("http://127.0.0.1:" + port);
    }
    return;
  }

  // 写操作铁律:非 TTY 且无 --yes → 拒绝
  const interactive = opts.readLine !== undefined || process.stdin.isTTY === true;
  if (!interactive && args.yes !== true) {
    console.error("bootstrap 是交互式命令:非交互环境请加 --yes 显式授权全部写操作。");
    process.exitCode = 2;
    return;
  }
  const ask = opts.readLine ?? (await defaultReadLine());

  // 1. 库存位置(默认:--home 直用,否则 ~/.skills-hub)
  const defaultRoot = args.home !== undefined && args.home !== "" ? path.resolve(args.home) : path.join(base, ".skills-hub");
  const rawRoot = args.yes === true ? defaultRoot : (await ask(`库存将保存在哪个目录?(直接回车使用默认: ${defaultRoot}) > `)).trim();
  const storeRoot = rawRoot === "" ? defaultRoot : path.resolve(rawRoot);

  // 2. 备份确认
  const doBackup = args.yes === true ||
    (await ask(`\n${RED}${BOLD}⚠ 即将把本机全部客户端(如 .claude/.cursor/.codex 等)的 skills 收录进统一库存。${RESET}\n先帮你备份一份保险,如果出现问题可以一键恢复。\n是否自动备份?(Y=备份后继续 / N=跳过备份) > `)).trim().toUpperCase() === "Y";

  if (doBackup) {
    const backupDir = path.join(storeRoot, "backups");
    console.log("正在备份(只读源目录,复制到 " + backupDir + ")…");
    const bak = await backupAllClientSkills(base, backupDir);
    warn(`✓ 已备份 ${bak.skillDirs} 个客户端 root 的 skills 到 ${bak.backupDir}\n  如果出现问题可以一键恢复(恢复能力随 #83 提供,当前请保留该目录)。`);
  } else {
    console.log("已跳过备份。");
  }

  // 3. 迁移确认
  const doMigrate = args.yes === true ||
    (await ask(`${RED}${BOLD}⚠ 即将把全部 skills 收录进库存 ${storeRoot}(重复内容自动去重,冲突绝不覆盖)。${RESET}\n输入 Y 开始迁移,输入其他任意键取消 > `)).trim().toUpperCase() === "Y";
  if (!doMigrate) {
    console.log("已取消,未做任何改动。");
    return;
  }

  // 4. 自动执行:建布局 → 收录全部 → 完成提示
  const result = await migrateAllSkills(base, storeRoot);
  warn(`✓ 全部完成:库存位于 ${storeRoot},收录 ${result.adopted} 份(新增/重复/冲突见上方统计)。`);
  if (result.discovered === 0) console.log("未发现任何达标 skill(缺 name/description 的目录不计入)。");

  // 5. 自动启动面板
  if (opts.ui !== false) {
    console.log("启动面板:http://127.0.0.1:" + port);
    await startUiServer(port, storeRoot);
    openBrowser("http://127.0.0.1:" + port);
  }
}
