import path from "node:path";
import {
  adoptMany,
  hashSkillFolder,
  readStoreIndex,
  resolveStoreRoot,
  STORE_SKILLS_DIR,
  type AdoptInput,
  type SkillRecord,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";

export const POINTER_REL = path.join(".skills-hub", "config.json");

/** 解析库存位置;未配置时打印错误并返回 null(exit 2 由调用方处理)。 */
export async function resolveStoreRootOrFail(args: { home: string | undefined }): Promise<string | null> {
  const home = resolveHome(args.home);
  const opts: StoreRootOptions = { pointerFilePath: path.join(home, POINTER_REL) };
  if (args.home !== undefined && args.home !== "") opts.cliHome = args.home;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") opts.envHome = envHome;
  const store = await resolveStoreRoot(opts);
  if (!store.ok) {
    console.error("库存未配置:" + store.message + " — 请先运行 skills-hub init --home <path> --yes");
    process.exitCode = 2;
    return null;
  }
  return store.storeRoot;
}

/** 写操作授权铁律(cli-commands-v0.md §2):非交互环境必须显式 --yes。 */
export function requireWriteAuth(args: { yes: boolean | undefined }): boolean {
  if (process.stdin.isTTY || args.yes === true) return true;
  console.error("写操作需要显式授权:非交互环境请加 --yes。");
  process.exitCode = 2;
  return false;
}

export interface AdoptArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runAdopt(args: AdoptArgs): Promise<void> {
  const paths = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (paths.length === 0) {
    console.error("用法: skills-hub adopt <本地skill目录路径> [--yes] [--dry-run]");
    process.exitCode = 2;
    return;
  }
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args)) return;
  const storeRoot = await resolveStoreRootOrFail(args);
  if (storeRoot === null) return;

  const inputs: AdoptInput[] = paths.map((p) => ({
    folderPath: path.resolve(p),
    origin: { kind: "local-scan", reference: path.resolve(p) },
  }));
  const report = await adoptMany(storeRoot, inputs, { dryRun });

  if (args.json) {
    console.log(JSON.stringify({
      dryRun,
      storeRoot,
      outcomes: report.outcomes.map((o) => ({
        kind: o.kind,
        folder: o.kind === "invalid" ? o.folderPath : o.kind === "conflict" ? o.name : o.record.dirName,
        ...(o.kind === "adopted" || o.kind === "duplicate" ? { hash: o.record.hash } : {}),
        ...(o.kind === "conflict" ? { existingHash: o.existingHash, incomingHash: o.incomingHash } : {}),
        ...(o.kind === "invalid" ? { reason: o.reason } : {}),
      })),
      adopted: report.adopted,
      duplicates: report.duplicates,
      conflicts: report.conflicts,
      invalid: report.invalid,
    }, null, 2));
    return;
  }
  for (const o of report.outcomes) {
    if (o.kind === "adopted") console.log("✓ 已收录: " + o.record.dirName + " (" + o.record.hash.slice(0, 12) + ")");
    else if (o.kind === "duplicate") console.log("≈ 已存在(内容相同): " + o.record.dirName + " — 来源已并入记录");
    else if (o.kind === "conflict") console.log("✗ 冲突(同名不同内容): " + o.name + " — 未覆盖,现有哈希 " + o.existingHash.slice(0, 12));
    else console.log("✗ 未收录(缺 name/description): " + o.folderPath);
  }
  console.log((dryRun ? "预演结果" : "收录结果") + `: 新增 ${report.adopted} / 重复 ${report.duplicates} / 冲突 ${report.conflicts} / 未达标 ${report.invalid}`);
}

export interface ListArgs {
  home: string | undefined;
  json: boolean | undefined;
  source: string | undefined;
  enabled: boolean | undefined;
}

export async function runList(args: ListArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args);
  if (storeRoot === null) return;
  let skills = await readStoreIndex(storeRoot);
  if (args.source !== undefined && args.source !== "") {
    const needle = args.source.toLowerCase();
    skills = skills.filter((s) =>
      s.origins.some((o) => o.kind.toLowerCase() === needle || o.reference.toLowerCase().includes(needle)),
    );
  }
  if (args.enabled === true) {
    skills = skills.filter((s) => s.visibleIn.length > 0);
  }
  if (args.json) {
    console.log(JSON.stringify({ storeRoot, total: skills.length, skills }, null, 2));
    return;
  }
  if (skills.length === 0) {
    console.log("库存为空" + (args.enabled ? "(启用状态过滤后)" : "") + "。用 skills-hub adopt 收录。");
    return;
  }
  for (const s of skills) {
    const origins = s.origins.map((o) => o.kind).join(",");
    const enabled = s.visibleIn.length > 0 ? " [启用]" : "";
    console.log(s.hash.slice(0, 12) + "  " + s.dirName + "  (来源: " + origins + ")" + enabled);
  }
  console.log("共 " + skills.length + " 个");
}

export interface ShowArgs {
  home: string | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runShow(args: ShowArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args);
  if (storeRoot === null) return;
  const needle = String(args._[0] ?? "").trim();
  if (needle === "") {
    console.error("用法: skills-hub show <skill名或哈希前缀>");
    process.exitCode = 2;
    return;
  }
  const skills = await readStoreIndex(storeRoot);
  const exact = skills.find((s) => s.dirName === needle);
  const byHash = exact === undefined ? skills.filter((s) => s.hash.startsWith(needle.toLowerCase())) : [];
  if (exact === undefined && byHash.length === 0) {
    console.error("未找到: " + needle + "。先 skills-hub list 看有哪些。" + (skills.length === 0 ? "(库存为空)" : ""));
    process.exitCode = 2;
    return;
  }
  const records: SkillRecord[] = exact !== undefined ? [exact] : byHash.slice(0, 10);
  if (args.json) {
    console.log(JSON.stringify({ storeRoot, matches: records }, null, 2));
    return;
  }
  for (const s of records) {
    console.log("名称: " + s.dirName);
    console.log("哈希: " + s.hash);
    console.log("描述: " + s.meta.description);
    console.log("来源: " + s.origins.map((o) => o.kind + " " + o.reference).join(" | "));
    console.log("入库: " + s.installedAt);
    console.log("启用: " + (s.visibleIn.length > 0 ? s.visibleIn.join(", ") : "未启用"));
    console.log("---");
  }
}

export interface VerifyArgs {
  home: string | undefined;
  json: boolean | undefined;
}

export async function runVerify(args: VerifyArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args);
  if (storeRoot === null) return;
  const skills = await readStoreIndex(storeRoot);
  const drifted: { name: string; recordedHash: string; actualHash: string }[] = [];
  const missing: { name: string; recordedHash: string }[] = [];
  const ok: string[] = [];
  for (const s of skills) {
    const dir = path.join(storeRoot, STORE_SKILLS_DIR, s.dirName);
    const actual = await hashSkillFolder(dir).catch(() => null);
    if (actual === null) {
      missing.push({ name: s.dirName, recordedHash: s.hash });
      continue;
    }
    if (actual === s.hash) ok.push(s.dirName);
    else drifted.push({ name: s.dirName, recordedHash: s.hash, actualHash: actual });
  }
  if (args.json) {
    console.log(JSON.stringify({ storeRoot, checked: skills.length, ok, drifted, missing }, null, 2));
    return;
  }
  console.log("校验 " + skills.length + " 个:");
  if (ok.length > 0) console.log("  ✓ " + ok.length + " 个与记录一致");
  for (const d of drifted) console.log("  ! 漂移: " + d.name + " (记录 " + d.recordedHash.slice(0, 12) + " ≠ 实际 " + d.actualHash.slice(0, 12) + ")");
  for (const m of missing) console.log("  ! 缺失: " + m.name + " (目录不存在)");
  if (drifted.length === 0 && missing.length === 0) console.log("全部一致,无漂移。");
  else console.log("发现 " + (drifted.length + missing.length) + " 处漂移/缺失 — verify 不自动改写,如需更新请重新 adopt 或人工处理。");
}
