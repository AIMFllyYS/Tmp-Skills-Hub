import { lstat } from "node:fs/promises";
import path from "node:path";
import { conflictVariantPath, readConflicts, type ConflictRecord } from "./conflicts.js";
import { isSafeRelativePath } from "./github-files.js";
import { isIgnoredSkillEntry } from "./skill-ignore.js";
import { isPortableSkillName } from "./skill-name.js";
import type { HubPaths } from "./store-location.js";

export class ConflictOperationError extends Error {
  constructor(readonly code: "not-found" | "bad-usage" | "outside" | "conflict", message: string) {
    super(message);
  }
}

export async function getConflictRecord(paths: HubPaths, skillName: string): Promise<ConflictRecord> {
  if (!isPortableSkillName(skillName)) throw new ConflictOperationError("bad-usage", "无效的技能名称");
  const record = (await readConflicts(paths)).find((entry) => entry.skillName === skillName);
  if (record === undefined) throw new ConflictOperationError("not-found", "没有未处理冲突: " + skillName);
  return record;
}

const missing = (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
  throw error;
};

export async function conflictDirectory(paths: HubPaths, record: ConflictRecord, variantId: string): Promise<string> {
  let directory = path.join(paths.skillsRoot, record.skillName);
  if (variantId !== "active") {
    if (!record.variants.some((variant) => variant.variantId === variantId)) {
      throw new ConflictOperationError("not-found", "冲突变体不存在");
    }
    directory = conflictVariantPath(paths, record.skillName, variantId);
  }
  const entity = await lstat(directory).catch(missing);
  if (!entity?.isDirectory() || entity.isSymbolicLink()) {
    throw new ConflictOperationError("not-found", "冲突版本目录不可用");
  }
  return directory;
}

/** Return an in-variant path without traversing links in any path component. */
export async function inspectConflictFile(root: string, relative: string) {
  const parts = relative.split("/");
  if (!isSafeRelativePath(relative) || parts.some((part) => !isPortableSkillName(part) ||
      (process.platform === "win32" && isIgnoredSkillEntry(part.toLowerCase())))) {
    throw new ConflictOperationError("outside", "文件路径越出技能目录或包含保留目录");
  }
  let file = root;
  for (const [index, part] of parts.entries()) {
    file = path.join(file, part);
    const info = await lstat(file).catch(missing);
    if (info?.isSymbolicLink()) throw new ConflictOperationError("outside", "不沿链接访问冲突文件");
    if (index === parts.length - 1) return { file, info };
    if (info !== null && !info.isDirectory()) throw new ConflictOperationError("conflict", "路径中间为普通文件");
  }
  throw new ConflictOperationError("outside", "文件路径为空");
}
