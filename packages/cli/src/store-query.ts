import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHubPaths, type HubPaths } from "@skills-hub/core";
import {
  attachVisibleIn,
  hashSkillFolder,
  readGroups,
  readLinksLedger,
  readStoreIndex,
  readUsageStats,
  recordUsage,
  writeFileAtomicSafe,
  writeGroups,
  writeLinksLedger,
  writeStoreIndex,
  writeUsageStats,
  type SkillRecord,
} from "@skills-hub/core";
import { emitError, emitOk } from "./json-out.js";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-shared.js";

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
    emitOk("list", { storeRoot: normalizeHubPaths(storeRoot).stateRoot, total: skills.length, skills });
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
    emitOk("show", { storeRoot: normalizeHubPaths(storeRoot).stateRoot, matches: records });
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
  accept?: boolean | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  _?: (string | number)[];
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
export async function performVerify(storeRoot: string | HubPaths): Promise<VerifyReport> {
  const skills = await readStoreIndex(storeRoot);
  const drifted: VerifyDrift[] = [];
  const missing: VerifyMissing[] = [];
  const passed: string[] = [];
  for (const s of skills) {
    const dir = path.join(normalizeHubPaths(storeRoot).skillsRoot, s.dirName);
    const actual = await hashSkillFolder(dir).catch(() => null);
    if (actual === null) {
      missing.push({ name: s.dirName, recordedHash: s.hash });
      continue;
    }
    if (actual === s.hash) passed.push(s.dirName);
    else drifted.push({ name: s.dirName, recordedHash: s.hash, actualHash: actual });
  }
  return { storeRoot: normalizeHubPaths(storeRoot).stateRoot, checked: skills.length, passed, drifted, missing };
}

export async function performAcceptDrift(paths: HubPaths, names: string[], dryRun: boolean) {
  const report = await performVerify(paths);
  const known = new Set([...report.passed, ...report.drifted.map((d) => d.name), ...report.missing.map((m) => m.name)]);
  const unknown = names.filter((name) => !known.has(name));
  if (unknown.length > 0) return { ok: false, code: "not-found", message: "未找到: " + unknown.join(", ") } as const;
  const selected = new Set(names);
  const matches = (name: string) => selected.size === 0 || selected.has(name);
  const accepted = report.drifted.filter((drift) => matches(drift.name));
  const missing = report.missing.filter((skill) => matches(skill.name));
  const result = { ok: true, dryRun, count: accepted.length, accepted, missing } as const;
  if (accepted.length === 0) return result;

  const updates = new Map(accepted.map((d) => [d.name, d]));
  const skills = await readStoreIndex(paths);
  const projected = skills.map((skill) => ({ ...skill, hash: updates.get(skill.dirName)?.actualHash ?? skill.hash }));
  if (new Set(projected.map((skill) => skill.hash)).size !== projected.length) {
    return { ok: false, code: "conflict", message: "接受漂移会产生同内容技能，请先处理重复项。" } as const;
  }
  if (dryRun) return result;

  const rekey = new Map(accepted.map((item) => [item.recordedHash, item.actualHash]));
  const updatedHash = (hash: string) => rekey.get(hash) ?? hash;
  const [groups, stats, links] = await Promise.all([readGroups(paths), readUsageStats(paths), readLinksLedger(paths)]);
  for (const group of groups.groups) group.memberHashes = [...new Set(group.memberHashes.map(updatedHash))];
  const counters: typeof stats.counters = Object.create(null) as typeof stats.counters;
  for (const [hash, count] of Object.entries(stats.counters)) {
    const key = updatedHash(hash);
    const previous = counters[key];
    counters[key] = { show: (previous?.show ?? 0) + count.show, enable: (previous?.enable ?? 0) + count.enable };
  }
  const actions = [
    ["groups.json", () => writeGroups(paths, groups)],
    ["stats.json", () => writeUsageStats(paths, { ...stats, counters })],
    ["links.json", () => writeLinksLedger(paths, links.map((entry) => ({
      ...entry, skillHash: updates.get(entry.entryName)?.actualHash ?? entry.skillHash,
    })))],
    ["index.json", () => writeStoreIndex(paths, projected)],
  ] as const;
  const original = await Promise.all(actions.map(async ([name]) =>
    readFile(path.join(paths.stateRoot, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return Buffer.from("{}\n");
      throw error;
    }),
  ));
  const rollback: (() => Promise<void>)[] = [];
  try {
    for (const [index, [name, apply]] of actions.entries()) {
      await apply();
      rollback.push(() => writeFileAtomicSafe(path.join(paths.stateRoot, name), original[index]!));
    }
  } catch (error) {
    const errors: unknown[] = [error];
    for (const recover of rollback.reverse()) {
      await recover().catch((rollbackError: unknown) => errors.push(rollbackError));
    }
    if (errors.length > 1) throw new AggregateError(errors, "刷新指纹失败，并且部分元数据未能回滚。", { cause: error });
    throw error;
  }
  return result;
}

export async function runVerify(args: VerifyArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "verify");
  if (storeRoot === null) return;
  if (args.accept) {
    if (!args.dryRun && !requireWriteAuth({ yes: args.yes, json: args.json }, "verify")) return;
    const result = await performAcceptDrift(storeRoot, (args._ ?? []).map(String), args.dryRun === true);
    if (!result.ok) {
      emitError(args.json === true, "verify", result.code, result.message);
      return;
    }
    if (args.json) {
      const { dryRun, count, accepted, missing } = result;
      emitOk("verify", { verb: "accept", dryRun, count, accepted, missing });
    } else {
      console.log((result.dryRun ? "将接受 " : "已接受 ") + result.count + " 个漂移。");
      for (const missing of result.missing) console.error("技能目录缺失，已跳过: " + missing.name);
    }
    if (result.missing.length > 0) process.exitCode = 1;
    return;
  }
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
