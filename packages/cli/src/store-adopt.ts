import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { normalizeHubPaths, type HubPaths } from "@skills-hub/core";
import {
  adoptMany,
  isGitHubUrl,
  STORE_TMP_DIR,
  type AdoptInput,
} from "@skills-hub/core";
import { GitHubSourceProvider } from "./github-source.js";
import { autoVersionSkillAssets } from "./git-ops.js";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { isSkillsShUrl, SkillsShSourceProvider } from "./skills-sh-source.js";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-shared.js";

export interface AdoptArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export interface AdoptOutcomeJson {
  kind: string;
  folder: string;
  hash?: string | undefined;
  existingHash?: string | undefined;
  incomingHash?: string | undefined;
  reason?: string | undefined;
}

export interface AdoptPerformResult {
  dryRun: boolean;
  storeRoot: string;
  adopted: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
  fetchFailed: boolean;
  fetchMessage?: string | undefined;
  outcomes: AdoptOutcomeJson[];
}

/** 清掉库存临时区里本次会话遗留的 github.* 目录(adopt 已入位的 adopt.* 已 rename,不受影响)。 */
async function cleanupGithubTmp(storeRoot: string | HubPaths): Promise<void> {
  const tmpDir = path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_TMP_DIR);
  let names: string[];
  try {
    names = await readdir(tmpDir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith("github.")) {
      await rm(path.join(tmpDir, name), { recursive: true, force: true });
    }
  }
}

/** CLI 与 HTTP 共用的收录执行层:去重/冲突仍走 adoptMany,不另写一套。 */
export async function performAdopt(
  storeRoot: string | HubPaths,
  sources: string[],
  opts: { dryRun?: boolean; fetchImpl?: typeof fetch; home?: string } = {},
): Promise<AdoptPerformResult> {
  const dryRun = opts.dryRun === true;
  const inputs: AdoptInput[] = [];
  let fetchFailed = false;
  let fetchMessage: string | undefined;

  for (const p of sources) {
    if (isGitHubUrl(p) || isSkillsShUrl(p)) continue;
    inputs.push({
      folderPath: path.resolve(p),
      origin: { kind: "local-scan", reference: path.resolve(p) },
    });
  }

  const urlPaths = sources.filter((p) => isGitHubUrl(p) || isSkillsShUrl(p));
  if (urlPaths.length > 0) {
    const github = new GitHubSourceProvider(
      normalizeHubPaths(storeRoot).stateRoot,
      opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {},
    );
    const skillsSh = new SkillsShSourceProvider({ github });
    for (const u of urlPaths) {
      try {
        const isSh = isSkillsShUrl(u);
        const provider = isSh ? skillsSh : github;
        const dirs = await provider.fetch(u);
        const kind = isSh ? ("skills-sh" as const) : ("github" as const);
        for (const d of dirs) {
          inputs.push({ folderPath: d, origin: { kind, reference: u } });
        }
      } catch (e) {
        fetchFailed = true;
        fetchMessage = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const report = await adoptMany(storeRoot, inputs, { dryRun });
  await cleanupGithubTmp(storeRoot);
  if (!dryRun && report.adopted > 0) {
    await autoVersionSkillAssets(opts.home, storeRoot, "feat(skills): adopt " + String(report.adopted) + " skill(s)");
  }

  return {
    dryRun,
    storeRoot: normalizeHubPaths(storeRoot).stateRoot,
    adopted: report.adopted,
    duplicates: report.duplicates,
    conflicts: report.conflicts,
    invalid: report.invalid,
    fetchFailed,
    fetchMessage,
    outcomes: report.outcomes.map((o) => ({
      kind: o.kind,
      folder: o.kind === "invalid" ? o.folderPath : o.kind === "conflict" ? o.name : o.record.dirName,
      ...(o.kind === "adopted" || o.kind === "duplicate" ? { hash: o.record.hash } : {}),
      ...(o.kind === "conflict" ? { existingHash: o.existingHash, incomingHash: o.incomingHash } : {}),
      ...(o.kind === "invalid" ? { reason: o.reason } : {}),
    })),
  };
}

export function printAdoptSummary(report: AdoptPerformResult, dryRun: boolean): void {
  if (report.fetchFailed && report.fetchMessage !== undefined) {
    console.error("✗ 拉取失败: " + report.fetchMessage);
  }
  for (const o of report.outcomes) {
    if (o.kind === "adopted") console.log("✓ 已收录: " + o.folder + " (" + (o.hash ?? "").slice(0, 12) + ")");
    else if (o.kind === "duplicate") console.log("≈ 已存在(内容相同): " + o.folder + " — 来源已并入记录");
    else if (o.kind === "conflict") console.log("✗ 冲突(同名不同内容): " + o.folder + " — 未覆盖,现有哈希 " + (o.existingHash ?? "").slice(0, 12));
    else console.log("✗ 未收录(缺 name/description): " + o.folder);
  }
  console.log((dryRun ? "预演结果" : "收录结果") + `: 新增 ${report.adopted} / 重复 ${report.duplicates} / 冲突 ${report.conflicts} / 未达标 ${report.invalid}`);
}

export async function runAdopt(args: AdoptArgs): Promise<void> {
  const paths = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (paths.length === 0) {
    emitError(args.json === true, "adopt", "bad-usage", "用法: skills-hub adopt <本地skill目录路径|GitHub链接> [--yes] [--dry-run]");
    return;
  }
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "adopt")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "adopt");
  if (storeRoot === null) return;

  const report = await performAdopt(storeRoot, paths, { dryRun, home: resolveHome(args.home) });

  if (args.json) {
    if (report.fetchFailed && report.fetchMessage !== undefined && report.outcomes.length === 0) {
      emitError(true, "adopt", "github-fetch-failed", report.fetchMessage);
      return;
    }
    emitOk("adopt", {
      dryRun,
      storeRoot: report.storeRoot,
      outcomes: report.outcomes,
      adopted: report.adopted,
      duplicates: report.duplicates,
      conflicts: report.conflicts,
      invalid: report.invalid,
      fetchFailed: report.fetchFailed,
    });
    if (report.fetchFailed) process.exitCode = 2;
    return;
  }
  printAdoptSummary(report, dryRun);
  if (report.fetchFailed) process.exitCode = 2;
}
