import path from "node:path";
import {
  attachVisibleIn,
  hashSkillFolder,
  readLinksLedger,
  readStoreIndex,
  recordUsage,
  STORE_SKILLS_DIR,
  type SkillRecord,
} from "@skills-hub/core";
import { emitError, emitOk } from "./json-out.js";
import { resolveStoreRootOrFail } from "./store-shared.js";

export interface ListArgs {
  home: string | undefined;
  json: boolean | undefined;
  source: string | undefined;
  enabled: boolean | undefined;
}

export async function runList(args: ListArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "list");
  if (storeRoot === null) return;
  let skills = attachVisibleIn(await readStoreIndex(storeRoot), await readLinksLedger(storeRoot));
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
    emitOk("list", { storeRoot, total: skills.length, skills });
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
  const storeRoot = await resolveStoreRootOrFail(args, "show");
  if (storeRoot === null) return;
  const needle = String(args._[0] ?? "").trim();
  if (needle === "") {
    emitError(args.json === true, "show", "bad-usage", "用法: skills-hub show <skill名或哈希前缀>");
    return;
  }
  const skills = attachVisibleIn(await readStoreIndex(storeRoot), await readLinksLedger(storeRoot));
  const exact = skills.find((s) => s.dirName === needle);
  const byHash = exact === undefined ? skills.filter((s) => s.hash.startsWith(needle.toLowerCase())) : [];
  if (exact === undefined && byHash.length === 0) {
    emitError(args.json === true, "show", "not-found", "未找到: " + needle + "。先 skills-hub list 看有哪些。" + (skills.length === 0 ? "(库存为空)" : ""));
    return;
  }
  const records: SkillRecord[] = exact !== undefined ? [exact] : byHash.slice(0, 10);
  // #27:show 是一次真实使用意图,每条展示的记录记一次(失败静默,不影响主流程)
  for (const s of records) await recordUsage(storeRoot, s.hash, "show").catch(() => undefined);
  if (args.json) {
    emitOk("show", { storeRoot, matches: records });
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

export interface VerifyDrift {
  name: string;
  recordedHash: string;
  actualHash: string;
}

export interface VerifyMissing {
  name: string;
  recordedHash: string;
}

export interface VerifyReport {
  storeRoot: string;
  checked: number;
  passed: string[];
  drifted: VerifyDrift[];
  missing: VerifyMissing[];
}

/** 重算哈希对照清单。只读,不改写快照。 */
export async function performVerify(storeRoot: string): Promise<VerifyReport> {
  const skills = await readStoreIndex(storeRoot);
  const drifted: VerifyDrift[] = [];
  const missing: VerifyMissing[] = [];
  const passed: string[] = [];
  for (const s of skills) {
    const dir = path.join(storeRoot, STORE_SKILLS_DIR, s.dirName);
    const actual = await hashSkillFolder(dir).catch(() => null);
    if (actual === null) {
      missing.push({ name: s.dirName, recordedHash: s.hash });
      continue;
    }
    if (actual === s.hash) passed.push(s.dirName);
    else drifted.push({ name: s.dirName, recordedHash: s.hash, actualHash: actual });
  }
  return { storeRoot, checked: skills.length, passed, drifted, missing };
}

export async function runVerify(args: VerifyArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "verify");
  if (storeRoot === null) return;
  const report = await performVerify(storeRoot);
  if (args.json) {
    emitOk("verify", { ...report });
    return;
  }
  console.log("校验 " + report.checked + " 个:");
  if (report.passed.length > 0) console.log("  ✓ " + report.passed.length + " 个与记录一致");
  for (const d of report.drifted) console.log("  ! 漂移: " + d.name + " (记录 " + d.recordedHash.slice(0, 12) + " ≠ 实际 " + d.actualHash.slice(0, 12) + ")");
  for (const m of report.missing) console.log("  ! 缺失: " + m.name + " (目录不存在)");
  if (report.drifted.length === 0 && report.missing.length === 0) console.log("全部一致,无漂移。");
  else console.log("发现 " + (report.drifted.length + report.missing.length) + " 处漂移/缺失 — verify 不自动改写,如需更新请重新 adopt 或人工处理。");
}
