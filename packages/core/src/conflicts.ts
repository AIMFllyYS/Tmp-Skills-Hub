import { lstat, mkdir, mkdtemp, readFile, realpath, rmdir } from "node:fs/promises";
import path from "node:path";
import { copyTreeJunctionSafe, moveDirSafe, unlinkNoFollow, writeFileAtomicSafe } from "./fs-atomic.js";
import { hashSkillFolder } from "./hash.js";
import { migrateVersionedData } from "./migrate.js";
import { isPortableSkillName } from "./skill-name.js";
import { normalizeHubPaths, type HubPaths } from "./store-location.js";

export const CONFLICTS_FILE_VERSION = 1;

export class ConflictWriteBusy extends Error {
  constructor() {
    super("库存正在执行接管或冲突决议，请稍后重试");
  }
}

/** Reconcile and conflict resolution both replace the shared inventory and conflict registry. */
export async function withConflictWriteLock<T>(paths: HubPaths, action: () => Promise<T>): Promise<T> {
  const lock = path.join(paths.stateRoot, "tmp", "conflict-write.lock");
  await mkdir(path.dirname(lock), { recursive: true });
  await mkdir(lock).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new ConflictWriteBusy();
    throw error;
  });
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}

export interface ConflictVariant {
  variantId: string;
  hash: string;
  sourceClients: string[];
  maxMtimeMs: number;
  fileCount: number;
  totalBytes: number;
  detectedAt: string;
}

export interface ConflictRecord {
  skillName: string;
  activeHash: string;
  variants: ConflictVariant[];
  shorterContentWarning: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConflictsFile {
  version: number;
  records: ConflictRecord[];
}

function conflictRoot(paths: string | HubPaths): string {
  return path.join(normalizeHubPaths(paths).stateRoot, "conflicts");
}

const isHash = (hash: unknown): hash is string => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);

export function conflictVariantPath(paths: string | HubPaths, skillName: string, variantId: string): string {
  if (!isPortableSkillName(skillName) || !/^[a-f0-9]{12}$/.test(variantId)) {
    throw new Error("非法冲突目录名或变体 ID");
  }
  return path.join(conflictRoot(paths), skillName, variantId);
}

function isVariant(input: unknown): input is ConflictVariant {
  if (typeof input !== "object" || input === null) return false;
  const v = input as Partial<ConflictVariant>;
  return isHash(v.hash) && v.variantId === v.hash.slice(0, 12) &&
    Array.isArray(v.sourceClients) && v.sourceClients.every((source: unknown) => typeof source === "string") &&
    [v.maxMtimeMs, v.fileCount, v.totalBytes].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) &&
    typeof v.detectedAt === "string";
}

function isRecord(input: unknown): input is ConflictRecord {
  if (typeof input !== "object" || input === null) return false;
  const record = input as Partial<ConflictRecord>;
  return typeof record.skillName === "string" && isPortableSkillName(record.skillName) && isHash(record.activeHash) &&
    Array.isArray(record.variants) && record.variants.every(isVariant) &&
    new Set(record.variants.map((variant) => variant.variantId)).size === record.variants.length &&
    typeof record.shorterContentWarning === "boolean" && typeof record.createdAt === "string" && typeof record.updatedAt === "string";
}

export async function readConflicts(paths: string | HubPaths): Promise<ConflictRecord[]> {
  const file = path.join(conflictRoot(paths), "conflicts.json");
  const raw = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("冲突池索引必须是对象");
  const value = parsed as Partial<ConflictsFile>;
  if (typeof value.version !== "number" || !Number.isInteger(value.version) ||
    !Array.isArray(value.records) || !value.records.every(isRecord)) {
    throw new Error("冲突池索引格式无效");
  }
  return migrateVersionedData({ version: value.version, records: value.records }, {
    current: CONFLICTS_FILE_VERSION, chain: [], label: "conflicts.json",
  }).records;
}

export async function writeConflicts(paths: string | HubPaths, records: readonly ConflictRecord[]): Promise<void> {
  const root = conflictRoot(paths);
  await mkdir(root, { recursive: true });
  const sorted = [...records].sort((a, b) => a.skillName.localeCompare(b.skillName));
  await writeFileAtomicSafe(path.join(root, "conflicts.json"), JSON.stringify({
    version: CONFLICTS_FILE_VERSION, records: sorted,
  }, null, 2) + "\n");
}

/** Publish a directory only after verifying the copy against the scan. */
export async function copyVerifiedVariant(sourcePath: string, dest: string, hash: string): Promise<void> {
  const parent = path.dirname(dest);
  const source = await realpath(sourcePath);
  await mkdir(parent, { recursive: true });
  const relative = path.relative(source, await realpath(parent));
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))) {
    throw new Error("副本目标位于源目录中: " + dest);
  }
  const stage = await mkdtemp(path.join(parent, ".skills-hub-variant-"));
  try {
    const tree = path.join(stage, "tree");
    await copyTreeJunctionSafe(source, tree);
    if (await hashSkillFolder(tree) !== hash) throw new Error("技能内容在复制期间变化: " + sourcePath);
    await moveDirSafe(tree, dest);
  } finally {
    await unlinkNoFollow(stage);
  }
}

export async function storeConflictVariant(
  paths: string | HubPaths,
  skillName: string,
  variant: ConflictVariant,
  sourcePath: string,
): Promise<void> {
  if (!isVariant(variant)) throw new Error("冲突变体指纹或统计字段无效");
  const dest = conflictVariantPath(paths, skillName, variant.variantId);
  const existing = await lstat(dest).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing !== null) {
    if (!existing.isDirectory() || await hashSkillFolder(dest) !== variant.hash) {
      throw new Error("变体 ID 对应不同内容或副本已损坏: " + variant.variantId);
    }
    return;
  }
  await copyVerifiedVariant(sourcePath, dest, variant.hash);
}

export async function recordConflict(paths: HubPaths, input: ConflictRecord): Promise<ConflictRecord> {
  if (!isRecord(input)) throw new Error("冲突记录无效");
  const records = await readConflicts(paths);
  const existing = records.find((entry) => entry.skillName === input.skillName);
  const variants = new Map(existing?.variants.map((variant) => [variant.variantId, variant]));
  for (const variant of input.variants) {
    const previous = variants.get(variant.variantId);
    if (previous && previous.hash !== variant.hash) throw new Error("冲突变体 ID 被不同内容占用");
    variants.set(variant.variantId, previous ? {
      ...previous,
      sourceClients: [...new Set([...previous.sourceClients, ...variant.sourceClients])].sort(),
      maxMtimeMs: Math.max(previous.maxMtimeMs, variant.maxMtimeMs),
    } : variant);
  }
  const merged: ConflictRecord = {
    ...input,
    variants: [...variants.values()].sort((a, b) => b.maxMtimeMs - a.maxMtimeMs || a.variantId.localeCompare(b.variantId)),
    createdAt: existing?.createdAt ?? input.createdAt,
  };
  await writeConflicts(paths, [...records.filter((entry) => entry.skillName !== input.skillName), merged]);
  return merged;
}
