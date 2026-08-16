import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import path from "node:path";
import { copyFile, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
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
import { DEFAULT_UI_PORT, startUiServer, type StartUiServerOptions } from "./ui-server.js";

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
  /**
   * 测试注入:结束时是否启动 ui 服务(默认 true)。
   * 传函数则调用该函数而不真起服务,便于断言传入的 home。
   */
  ui?: boolean | ((opts: StartUiServerOptions) => Promise<void>);
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

/** 快照里一条逻辑文件:哪个客户端的哪条相对路径对应哪份内容。 */
export interface BackupFileEntry {
  clientId: string;
  rel: string;
  hash: string;
  size: number;
}

export interface BackupManifest {
  snapshotId: string;
  createdAt: string;
  clientRoots: number;
  skillDirs: number;
  logicalFiles: number;
  writtenFiles: number;
  bytesSaved: number;
  entries: BackupFileEntry[];
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * 把一棵 skills 树摄入 blob 池。跟随链接复制内容,悬空链接跳过。
 * 同一内容哈希只写一份;结构只记进 entries,不在 roots/ 再铺一份树。
 */
async function ingestTree(
  src: string,
  relPrefix: string,
  clientId: string,
  blobsDir: string,
  seen: Map<string, string>,
  entries: BackupFileEntry[],
  stats: { logical: number; written: number; saved: number },
): Promise<void> {
  let st;
  try {
    st = await stat(src);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (st.isDirectory()) {
    const children = await readdir(src, { withFileTypes: true });
    for (const e of children) {
      const childRel = relPrefix === "" ? e.name : relPrefix + "/" + e.name;
      await ingestTree(path.join(src, e.name), childRel, clientId, blobsDir, seen, entries, stats);
    }
    return;
  }
  if (!st.isFile()) return;
  const buf = await readFile(src);
  const hash = sha256(buf);
  stats.logical += 1;
  if (!seen.has(hash)) {
    const blobPath = path.join(blobsDir, hash);
    const tmp = blobPath + ".tmp-" + process.pid + "-" + Date.now();
    await writeFile(tmp, buf);
    await rename(tmp, blobPath);
    seen.set(hash, blobPath);
    stats.written += 1;
  } else {
    stats.saved += buf.length;
  }
  entries.push({ clientId, rel: relPrefix, hash, size: buf.length });
}

/**
 * 备份:内容进 blobs/<sha256>,结构进 manifest。
 * 跟随链接取内容(备份是内容保险),按哈希去重,避免 N 个客户端各写一遍。
 * 正式形态见 #83 / #116;本函数是止血,寻址思路与分析稿方案 A 对齐。
 */
export async function backupAllClientSkills(
  baseHome: string,
  backupRoot: string,
  storeRoot?: string,
): Promise<{
  snapshotId: string;
  clientRoots: number;
  skillDirs: number;
  backupDir: string;
  logicalFiles: number;
  writtenFiles: number;
  bytesSaved: number;
}> {
  const snapshotId = new Date().toISOString().replace(/[:]/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
  const snapDir = path.join(backupRoot, snapshotId);
  const blobsDir = path.join(snapDir, "blobs");
  await mkdir(blobsDir, { recursive: true });
  const realBase = await realpath(baseHome).catch(() => baseHome);
  const roots = await discoverClientRoots(baseHome, storeRoot !== undefined && storeRoot !== "" ? { storeRoot } : undefined);
  const seen = new Map<string, string>();
  const entries: BackupFileEntry[] = [];
  const stats = { logical: 0, written: 0, saved: 0 };
  let skillDirs = 0;
  for (const root of roots) {
    const rel = path.relative(realBase, root.skillsDir).split(path.sep).join("/");
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    await ingestTree(root.skillsDir, rel, root.clientId, blobsDir, seen, entries, stats);
    skillDirs += 1;
  }
  const manifest: BackupManifest = {
    snapshotId,
    createdAt: new Date().toISOString(),
    clientRoots: roots.length,
    skillDirs,
    logicalFiles: stats.logical,
    writtenFiles: stats.written,
    bytesSaved: stats.saved,
    entries,
  };
  await writeFile(path.join(snapDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return {
    snapshotId,
    clientRoots: roots.length,
    skillDirs,
    backupDir: snapDir,
    logicalFiles: stats.logical,
    writtenFiles: stats.written,
    bytesSaved: stats.saved,
  };
}

/** 按 manifest + blobs 还原目录树(测试与验收用;正式 restore 命令在 #83)。 */
export async function restoreBackupSnapshot(snapshotDir: string, destRoot: string): Promise<void> {
  const raw = JSON.parse(await readFile(path.join(snapshotDir, "manifest.json"), "utf8")) as BackupManifest;
  for (const e of raw.entries) {
    const dest = path.join(destRoot, e.clientId, ...e.rel.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(path.join(snapshotDir, "blobs", e.hash), dest);
  }
}

/** 发现并收录:扫描 base 下全部客户端 root,收集达标 skill 目录,一次批量 adopt。 */
export async function migrateAllSkills(
  baseHome: string,
  storeRoot: string,
): Promise<{ discovered: number; adopted: number; dryRun: boolean }> {
  await initializeStoreLayout(storeRoot);
  await ensureBuiltinGroups(storeRoot);
  // 指针写 home 基座(baseHome)下,与幂等检查(读 baseHome/.skills-hub/config.json)一致;
  // 若写 storeRoot 内部(无 --home 时 storeRoot=~/.skills-hub),下次 bootstrap 会永远判为未配置。
  await writePointerFile(baseHome, storeRoot);
  const roots = await discoverClientRoots(baseHome, { storeRoot });
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
    await launchUi(port, base, opts);
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
    const bak = await backupAllClientSkills(base, backupDir, storeRoot);
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

  // 5. 自动启动面板——必须传 home 基座,不能传 storeRoot(#95)
  if (opts.ui !== false) {
    console.log("启动面板:http://127.0.0.1:" + port);
  }
  await launchUi(port, base, opts);
}

/** 启动面板:home 永远是客户端发现基座。测试可注入函数替身。 */
async function launchUi(port: number, home: string, opts: BootstrapOptions): Promise<void> {
  if (opts.ui === false) return;
  const start = typeof opts.ui === "function" ? opts.ui : startUiServer;
  await start({ port, home });
  if (typeof opts.ui !== "function") openBrowser("http://127.0.0.1:" + port);
}
