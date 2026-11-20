import { createInterface } from "node:readline";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { openBrowser } from "./open-console.js";
import {
  adoptSkillFolder,
  discoverClientRoots,
  ensureBuiltinGroups,
  initializeStoreLayout,
  planReconcile,
  type HubPaths,
  readSkillMeta,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { performLinkChange } from "./link-actions.js";
import { planInitialPaths, resolveConfiguredHubPaths } from "./store-shared.js";
import { validateSkillsRoot } from "./store-migrate.js";
import { performReconcile, reconcilePreview } from "./reconcile-cmds.js";
import { performAdopt, printAdoptSummary, writePointerFile } from "./store-cmds.js";
import { DEFAULT_UI_PORT, startUiServer, type StartUiServerOptions } from "./ui-server.js";

/**
 * bootstrap:预览并确认接管，备份校验后将客户端技能收敛为纯软链接，再启动面板。
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
  ui?: boolean | ((opts: StartUiServerOptions) => Promise<unknown>);
  /** 打包后的 Electron resources/self-skill 目录覆写 */
  selfSkillDir?: string;
}

function defaultReadLine(): { ask: (prompt: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (prompt: string) => new Promise<string>((resolve) => rl.question(prompt, resolve)),
    close: () => rl.close(),
  };
}

/** 发现并收录:扫描 base 下全部客户端 root,收集达标 skill 目录,一次批量 adopt。 */
export async function migrateAllSkills(
  baseHome: string,
  storeRoot: string | HubPaths,
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
  const report = await performAdopt(storeRoot, dirs, { dryRun: false });
  printAdoptSummary(report, false);
  return { discovered, adopted: report.adopted, dryRun: false };
}

export async function runBootstrap(args: BootstrapArgs, opts: BootstrapOptions = {}): Promise<void> {
  const port = args.port ?? DEFAULT_UI_PORT;
  const base = resolveHome(args.home);
  const existing = await resolveConfiguredHubPaths(base);
  if (!existing.ok && existing.reason === "invalid-pointer") throw new Error(existing.message);
  if (existing.ok) {
    console.log("库存已就绪:" + existing.paths.skillsRoot + " — 跳过初始化,直接启动面板。");
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
  const rlHandle = opts.readLine === undefined && args.yes !== true ? defaultReadLine() : null;
  const ask = opts.readLine ?? rlHandle?.ask;
  const defaults = planInitialPaths(base);
  let storeRoot: HubPaths;
  try {
    console.log("控制与备份中心（固定）: " + defaults.stateRoot);
    const requested = ask === undefined || args.yes === true
      ? "" : (await ask(`唯一真源目录（回车使用 ${defaults.skillsRoot}） > `)).trim();
    storeRoot = planInitialPaths(base, requested === "" ? {} : { skillsRoot: requested });
    const validation = await validateSkillsRoot(base, storeRoot.stateRoot, storeRoot.skillsRoot);
    if (!validation.ok) throw new Error(validation.message);
    storeRoot = { ...storeRoot, skillsRoot: validation.target };

    const preview = reconcilePreview(await planReconcile(base, storeRoot));
    console.log(`待接管：新增 ${preview.toAdopt.length}，同指纹 ${preview.toRelinkIdentical.length}，同名冲突 ${preview.conflicts.length}；保留外链 ${preview.skippedExternalLinks.length}。`);
    console.log("确认后先生成并校验备份，再把已接管落点改为指向唯一真源的软链接。");
    if (args.yes !== true && (await ask!("输入 Y 确认备份和接管，其他键取消 > ")).trim().toUpperCase() !== "Y") {
      console.log("已取消，未写入库存或客户端。");
      return;
    }
  } finally {
    rlHandle?.close();
  }

  await initializeStoreLayout(storeRoot);
  await ensureBuiltinGroups(storeRoot);
  const result = await performReconcile(base, storeRoot, false);
  if (!result.ok) {
    warn("接管失败: " + result.message);
    process.exitCode = 2;
    return;
  }
  await writePointerFile(base, storeRoot);
  warn(`✓ 备份 ${result.snapshotId} 已校验。入库 ${result.adoptedCount} 份，保留 ${result.conflictCount} 组冲突，建立 ${result.linksCreated} 条客户端链接。`);
  for (const failure of result.failures) console.error(`[${failure.clientId}] ${failure.skillName} ${failure.reason}`);
  if (result.failures.length > 0) console.error("部分落点未接管，可再次运行 skills-hub reconcile。");

  // 4b. 收录并启用自身 skill(#169)
  await adoptAndEnableSelfSkill(base, storeRoot, opts.selfSkillDir);

  // 5. 自动启动面板——必须传 home 基座,不能传 storeRoot(#95)
  if (opts.ui !== false) {
    console.log("启动面板:http://127.0.0.1:" + port);
  }
  await launchUi(port, base, opts);
}

/**
 * Adopt the skills-hub self-skill and enable it to all discovered clients.
 * Idempotent: skips if already in the store.
 */
export async function adoptAndEnableSelfSkill(
  home: string,
  storeRoot: string | HubPaths,
  selfSkillDirOverride?: string,
): Promise<void> {
  const selfSkillDir = findSelfSkillDir(selfSkillDirOverride);
  if (selfSkillDir === null) return;
  try {
    const outcome = await adoptSkillFolder(storeRoot, selfSkillDir, { kind: "authored", reference: "bootstrap" });
    if (outcome.kind !== "adopted" && outcome.kind !== "duplicate") return;
    const record = outcome.record;
    const roots = await discoverClientRoots(home, { storeRoot });
    for (const root of roots) {
      try {
        await performLinkChange(
          { storeRoot, clientId: root.clientId, scope: "global", skillsDir: root.skillsDir, dirNames: [record.dirName] },
          "enable",
        );
      } catch {
        // best-effort: skip clients where linking fails
      }
    }
  } catch {
    // self-skill adoption is best-effort
  }
}

function findSelfSkillDir(overrideDir?: string): string | null {
  const candidates: string[] = [];
  if (overrideDir !== undefined && overrideDir !== "") {
    candidates.push(path.join(overrideDir, "SKILL.md"));
  }
  const envDir = process.env.SKILLSHUB_SELF_SKILL_DIR;
  if (envDir !== undefined && envDir !== "") {
    candidates.push(path.join(envDir, "SKILL.md"));
  }
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const cliSrc = path.dirname(thisFile);
    candidates.push(
      path.resolve(cliSrc, "..", "self-skill", "SKILL.md"),
      path.resolve(cliSrc, "self-skill", "SKILL.md"),
    );
  } catch {
    // fallback
  }
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return path.dirname(c);
    } catch {
      // continue
    }
  }
  return null;
}

/** 启动面板:home 永远是客户端发现基座。测试可注入函数替身。 */
async function launchUi(port: number, home: string, opts: BootstrapOptions): Promise<void> {
  if (opts.ui === false) return;
  if (typeof opts.ui === "function") {
    await opts.ui({ port, home });
    return;
  }
  const handle = await startUiServer({ port, home });
  openBrowser(handle.url);
}
