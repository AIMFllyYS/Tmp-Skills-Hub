import { mkdir, mkdtemp, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { conflictDirectory, ConflictOperationError, getConflictRecord, inspectConflictFile } from "./conflict-paths.js";
import { conflictVariantPath, ConflictWriteBusy, copyVerifiedVariant, readConflicts, withConflictWriteLock, writeConflicts, type ConflictRecord } from "./conflicts.js";
import { moveDirSafe, unlinkNoFollow, writeFileAtomicSafe } from "./fs-atomic.js";
import { hashSkillFolder } from "./hash.js";
import { MAX_FILE_BYTES } from "./skill-files.js";
import { parseSkillMeta, readSkillMeta } from "./skill-md.js";
import { isPortableSkillName } from "./skill-name.js";
import { installSkillRevision } from "./skill-revision.js";
import type { HubPaths } from "./store-location.js";
import { readStoreIndexFile } from "./store.js";
import { uniqueTmpId } from "./tmp-id.js";
import type { SkillRecord } from "./types.js";
import { zipDirectory } from "./zip.js";

export type ConflictResolution =
  | { mode: "pick"; winnerVariantId: string }
  | { mode: "merge"; mergedFiles: Record<string, string>; deletePaths?: string[] }
  | { mode: "split"; variantId: string; newName: string };

export type ConflictResolutionResult =
  | {
      ok: true;
      skillName: string;
      mode: ConflictResolution["mode"];
      activeHash: string;
      archives: string[];
      remainingVariants: number;
      newSkill?: SkillRecord;
    }
  | { ok: false; code: "not-found" | "bad-usage" | "outside" | "conflict" | "io-error"; message: string };

async function archiveVariants(paths: HubPaths, record: ConflictRecord, ids: readonly string[], runId: string): Promise<string[]> {
  const root = path.join(paths.stateRoot, "archive", "conflicts");
  await mkdir(root, { recursive: true });
  const archives: string[] = [];
  for (const id of ids) {
    const source = await conflictDirectory(paths, record, id);
    const variant = record.variants.find((entry) => entry.variantId === id)!;
    if (await hashSkillFolder(source) !== variant.hash) throw new ConflictOperationError("conflict", "冲突副本指纹已变化");
    const file = path.join(root, `${record.skillName}-${id}-${runId}.zip`);
    await writeFileAtomicSafe(file, await zipDirectory(source));
    archives.push(file);
  }
  return archives;
}

async function updatePool(
  paths: HubPaths,
  record: ConflictRecord,
  remaining: ConflictRecord | null,
  runId: string,
  onlyVariant?: string,
): Promise<void> {
  const records = await readConflicts(paths);
  const live = records.find((entry) => entry.skillName === record.skillName);
  if (JSON.stringify(live) !== JSON.stringify(record)) throw new ConflictOperationError("conflict", "冲突池已变化，请刷新");
  const source = onlyVariant === undefined
    ? path.dirname(conflictVariantPath(paths, record.skillName, record.activeHash.slice(0, 12)))
    : conflictVariantPath(paths, record.skillName, onlyVariant);
  const archived = path.join(paths.stateRoot, "archive", "conflicts", "originals", record.skillName + "-" + runId);
  await mkdir(path.dirname(archived), { recursive: true });
  await moveDirSafe(source, archived);
  try {
    await writeConflicts(paths, [...records.filter((entry) => entry.skillName !== record.skillName), ...(remaining === null ? [] : [remaining])]);
  } catch (error) {
    try { await moveDirSafe(archived, source); }
    catch (cause) { throw new AggregateError([error, cause], "冲突记录未能更新，原副本仍位于归档", { cause }); }
    throw error;
  }
}

async function mergeInto(root: string, files: Record<string, string>, deletePaths: readonly string[]): Promise<void> {
  const changed = new Set<string>();
  for (const [name, content] of Object.entries(files)) {
    const key = process.platform === "win32" ? name.toLowerCase() : name;
    if (changed.has(key)) throw new ConflictOperationError("bad-usage", "同一文件出现多次");
    changed.add(key);
    const { file, info } = await inspectConflictFile(root, name);
    if (info !== null && !info.isFile()) throw new ConflictOperationError("conflict", "合并目标不是普通文件");
    if (typeof content !== "string" || Buffer.byteLength(content) > MAX_FILE_BYTES) throw new ConflictOperationError("bad-usage", "合并内容不是有效的限长文本");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomicSafe(file, content);
  }
  for (const name of deletePaths) {
    const key = process.platform === "win32" ? name.toLowerCase() : name;
    if (changed.has(key)) throw new ConflictOperationError("bad-usage", "同一文件不能同时写入和删除");
    changed.add(key);
    const { file, info } = await inspectConflictFile(root, name);
    if (info !== null && !info.isFile()) throw new ConflictOperationError("conflict", "仅支持移除文件");
    if (info !== null) await unlink(file); // staged copy; the active version is still intact
  }
}

async function rewriteSkillName(root: string, newName: string): Promise<void> {
  const { file, info } = await inspectConflictFile(root, "SKILL.md");
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) throw new ConflictOperationError("conflict", "变体缺少有效 SKILL.md");
  const raw = await readFile(file, "utf8");
  if (parseSkillMeta(raw) === null) throw new ConflictOperationError("conflict", "变体缺少有效元数据");
  const next = raw.replace(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)/,
    (_match, open: string, fields: string, close: string) => open + fields.replace(/^(name[ \t]*:[ \t]*)[^\r\n]*/m, (_line, key: string) => key + newName) + close);
  if (parseSkillMeta(next)?.name !== newName) throw new ConflictOperationError("conflict", "无法更新拆分副本名称");
  await writeFileAtomicSafe(file, next);
}

async function applyResolution(
  paths: HubPaths, record: ConflictRecord, input: ConflictResolution, stage: string, runId: string,
): Promise<Extract<ConflictResolutionResult, { ok: true }>> {
  const skillName = record.skillName;
  const active = await conflictDirectory(paths, record, "active");
  const currentHash = await hashSkillFolder(active);
  const index = await readStoreIndexFile(paths);
  const current = index.skills.find((skill) => skill.dirName === skillName);
  if (current === undefined) throw new ConflictOperationError("conflict", "真源技能已脱离库存索引");
  const origin = { kind: "authored" as const, reference: "conflict-resolution:" + skillName };
  const staged = path.join(stage, "work");
  const outcome = { ok: true as const, mode: input.mode, skillName, activeHash: currentHash, remainingVariants: 0 };
  if (input.mode === "split") {
    const { newName, variantId } = input;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(newName) || !isPortableSkillName(newName) || newName.toLowerCase() === skillName.toLowerCase()) {
      throw new ConflictOperationError("bad-usage", "拆分需要不同名的小写英文技能名");
    }
    if ([...index.skills, ...index.drafts].some((skill) => skill.dirName.toLowerCase() === newName)) {
      throw new ConflictOperationError("conflict", "拆分名称已被库存或草稿占用");
    }
    const variant = record.variants.find((item) => item.variantId === variantId);
    if (variant === undefined) throw new ConflictOperationError("not-found", "拆分变体不存在");
    const source = await conflictDirectory(paths, record, variantId);
    await copyVerifiedVariant(source, staged, variant.hash);
    await rewriteSkillName(staged, newName);
    const remaining = record.variants.filter((item) => item.variantId !== variantId);
    const unresolved = remaining.filter((item) => item.hash !== record.activeHash);
    const archives = await archiveVariants(paths, record, [variantId], runId);
    const complete = unresolved.length === 0;
    const updated = complete ? null : { ...record, variants: remaining, updatedAt: new Date().toISOString() };
    const newSkill = await installSkillRevision(paths, {
      dirName: newName, createOnly: true, sourcePath: staged, hash: await hashSkillFolder(staged), origins: [origin],
      finalize: () => updatePool(paths, record, updated, runId, complete ? undefined : variantId),
    });
    return { ...outcome, archives, newSkill, remainingVariants: unresolved.length };
  }

  const finalize = () => updatePool(paths, record, null, runId);
  if (input.mode === "pick") {
    const selected = await conflictDirectory(paths, record, input.winnerVariantId);
    const newHash = await hashSkillFolder(selected);
    if (input.winnerVariantId !== "active" && record.variants.find((variant) => variant.variantId === input.winnerVariantId)?.hash !== newHash) {
      throw new ConflictOperationError("conflict", "选定版本指纹已变化");
    }
    const archives = await archiveVariants(paths, record, record.variants.filter((variant) => variant.hash !== newHash).map((variant) => variant.variantId), runId);
    if (newHash === currentHash && current.hash === currentHash) await finalize();
    else await installSkillRevision(paths, { dirName: skillName, sourcePath: selected, hash: newHash, origins: [origin], finalize });
    return { ...outcome, archives, activeHash: newHash };
  }

  await copyVerifiedVariant(active, staged, currentHash);
  await mergeInto(staged, input.mergedFiles, input.deletePaths ?? []);
  const meta = await readSkillMeta(staged);
  if (meta === null || meta.name !== current.meta.name) throw new ConflictOperationError("bad-usage", "合并后必须保留技能名称和有效说明");
  const hash = await hashSkillFolder(staged);
  const archives = await archiveVariants(paths, record, record.variants.map((variant) => variant.variantId), runId);
  await installSkillRevision(paths, { dirName: skillName, sourcePath: staged, hash, origins: [origin], finalize });
  return { ...outcome, archives, activeHash: hash };
}

export async function resolveConflict(paths: HubPaths, skillName: string, input: ConflictResolution): Promise<ConflictResolutionResult> {
  try {
    return await withConflictWriteLock(paths, async () => {
      const record = await getConflictRecord(paths, skillName);
      const stage = await mkdtemp(path.join(paths.stateRoot, "tmp", "resolve-"));
      try {
        return await applyResolution(paths, record, input, stage, uniqueTmpId());
      } finally {
        await unlinkNoFollow(stage);
      }
    });
  } catch (error) {
    return {
      ok: false, code: error instanceof ConflictWriteBusy ? "conflict" :
        error instanceof ConflictOperationError ? error.code : "io-error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
