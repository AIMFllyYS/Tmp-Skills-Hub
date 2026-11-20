import { createHash } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { conflictDirectory, ConflictOperationError, getConflictRecord, inspectConflictFile } from "./conflict-paths.js";
import { isIgnoredSkillEntry } from "./skill-ignore.js";
import { listSkillFiles, MAX_FILE_BYTES, readSkillFile, type SkillFileReadResult } from "./skill-files.js";
import type { HubPaths } from "./store-location.js";

export interface DiffLine {
  kind: "context" | "add" | "del";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface UnifiedDiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface ConflictDiffFile {
  relPath: string;
  status: "added" | "removed" | "modified" | "unchanged";
  isBinary: boolean;
  sizeA: number;
  sizeB: number;
  truncated?: true;
  hunks?: UnifiedDiffHunk[];
}

interface Side {
  bytes: number;
  hash: string;
  text: string | null;
  binary: boolean;
  oversized: boolean;
}

function decode(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return null; }
}

async function inspectSide(root: string, relPath: string): Promise<Side | null> {
  const candidate = await inspectConflictFile(root, relPath).catch((error: unknown) => {
    if (error instanceof ConflictOperationError && error.code !== "not-found") return null;
    throw error;
  });
  if (!candidate?.info?.isFile()) return null;
  const { file, info } = candidate;
  const hash = createHash("sha256");
  if (info.size <= MAX_FILE_BYTES) {
    const data = await readFile(file);
    const text = decode(data);
    return { bytes: data.length, hash: hash.update(data).digest("hex"), text, binary: text === null, oversized: false };
  }
  const handle = await open(file, "r");
  try {
    const sample = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const binary = sample.subarray(0, bytesRead).includes(0);
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) {
      bytes += chunk.length as number;
      hash.update(chunk);
    }
    return { bytes, hash: hash.digest("hex"), text: null, binary, oversized: true };
  } finally {
    await handle.close();
  }
}

const CONTEXT = 3;
const MAX_LINES = 1024;
const MAX_HUNK_BYTES = 48 * 1024;
const MAX_DIFF_BYTES = 512 * 1024;

function linesOf(text: string): string[] {
  if (text === "") return [];
  return text.split("\n");
}

function compareLines(a: string[], b: string[]): DiffLine[] {
  const width = b.length + 1;
  const matrix = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      matrix[i * width + j] = a[i] === b[j]
        ? matrix[(i + 1) * width + j + 1]! + 1
        : Math.max(matrix[(i + 1) * width + j]!, matrix[i * width + j + 1]!);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: "context", oldLine: i + 1, newLine: j + 1, text: a[i]! });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || matrix[(i + 1) * width + j]! >= matrix[i * width + j + 1]!)) {
      lines.push({ kind: "del", oldLine: i + 1, text: a[i++]! });
    } else {
      lines.push({ kind: "add", newLine: j + 1, text: b[j++]! });
    }
  }
  return lines;
}

function makeHunks(lines: DiffLine[]): UnifiedDiffHunk[] {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const [index, line] of lines.entries()) {
    if (line.kind === "context") continue;
    const start = Math.max(0, index - CONTEXT);
    const end = Math.min(lines.length, index + CONTEXT + 1);
    const previous = ranges[ranges.length - 1];
    if (previous && start <= previous.end) previous.end = end;
    else ranges.push({ start, end });
  }
  return ranges.map(({ start, end }) => {
    const part = lines.slice(start, end);
    const oldCount = part.filter((line) => line.oldLine !== undefined).length;
    const newCount = part.filter((line) => line.newLine !== undefined).length;
    const oldStart = part.find((line) => line.oldLine !== undefined)?.oldLine
      ?? lines.slice(0, start).findLast((line) => line.oldLine !== undefined)?.oldLine ?? 0;
    const newStart = part.find((line) => line.newLine !== undefined)?.newLine
      ?? lines.slice(0, start).findLast((line) => line.newLine !== undefined)?.newLine ?? 0;
    return { header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, lines: part };
  });
}

export async function diffConflictVariants(paths: HubPaths, skillName: string, variantA: string, variantB: string) {
  const conflict = await getConflictRecord(paths, skillName);
  const [dirA, dirB] = await Promise.all([conflictDirectory(paths, conflict, variantA), conflictDirectory(paths, conflict, variantB)]);
  const [treeA, treeB] = await Promise.all([listSkillFiles(dirA, isIgnoredSkillEntry), listSkillFiles(dirB, isIgnoredSkillEntry)]);
  if (!treeA.ok || !treeB.ok) throw new Error("无法读取冲突变体文件清单");
  const names = [...new Set([...treeA.entries, ...treeB.entries].filter((entry) => entry.kind === "file").map((entry) => entry.path))].sort();
  const files: ConflictDiffFile[] = [];
  let shownBytes = 0;
  for (const relPath of names) {
    const [a, b] = await Promise.all([inspectSide(dirA, relPath), inspectSide(dirB, relPath)]);
    if (a === null && b === null) continue;
    const status = a === null ? "added" : b === null ? "removed" : a.hash === b.hash ? "unchanged" : "modified";
    const file: ConflictDiffFile = { relPath, status, sizeA: a?.bytes ?? 0, sizeB: b?.bytes ?? 0, isBinary: Boolean(a?.binary || b?.binary) };
    if (status !== "unchanged" && !file.isBinary) {
      const oldLines = linesOf(a?.text ?? "");
      const newLines = linesOf(b?.text ?? "");
      if (a?.oversized || b?.oversized || oldLines.length > MAX_LINES || newLines.length > MAX_LINES ||
        file.sizeA + file.sizeB > MAX_HUNK_BYTES || shownBytes + file.sizeA + file.sizeB > MAX_DIFF_BYTES) {
        file.truncated = true;
      } else {
        file.hunks = makeHunks(compareLines(oldLines, newLines));
        shownBytes += file.sizeA + file.sizeB;
      }
    }
    files.push(file);
  }
  return { skillName, variantA, variantB, files, truncated: treeA.truncated || treeB.truncated || files.some((file) => file.truncated) };
}

export async function readConflictVariantFile(paths: HubPaths, skillName: string, variantId: string, relPath: string): Promise<SkillFileReadResult> {
  try {
    const directory = await conflictDirectory(paths, await getConflictRecord(paths, skillName), variantId);
    const { file } = await inspectConflictFile(directory, relPath);
    const result = await readSkillFile(directory, relPath);
    if (result.ok && result.content.includes("\uFFFD") && decode(await readFile(file)) === null) {
      return { ok: false, code: "binary", message: "文件不是有效 UTF-8 文本" };
    }
    return result;
  } catch (error) {
    const code = error instanceof ConflictOperationError && error.code === "outside" ? "outside" :
      error instanceof ConflictOperationError ? "not-found" : "io-error";
    return { ok: false, code, message: error instanceof Error ? error.message : String(error) };
  }
}
