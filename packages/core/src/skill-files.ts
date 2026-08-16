import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * skill 内容读取(#36):文件树与文件内容,供面板查看器使用。
 * - 路径校验:任何读取都限制在 skillDir 之内(防路径穿越)
 * - 大文件与二进制有明确降级,不把调用方卡死
 * - 确定性:树按 POSIX 相对路径排序,目录在前
 */

export const MAX_TREE_ENTRIES = 500;
export const MAX_FILE_BYTES = 512 * 1024;

export interface SkillFileEntry {
  path: string; // POSIX 相对路径
  kind: "file" | "dir";
  sizeBytes: number;
}

export interface SkillTreeOk {
  ok: true;
  entries: SkillFileEntry[];
  truncated: boolean;
}

export type SkillTreeResult = SkillTreeOk | { ok: false; code: "not-found" | "io-error"; message: string };

/** 递归收集文件树(限制条目数,超出标记 truncated 并停止)。 */
export async function listSkillFiles(skillDir: string): Promise<SkillTreeResult> {
  const entries: SkillFileEntry[] = [];
  let truncated = false;
  const walk = async (dir: string): Promise<boolean> => {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return false;
    }
    names.sort();
    for (const name of names) {
      if (truncated || entries.length >= MAX_TREE_ENTRIES) {
        truncated = true;
        return false;
      }
      const full = path.join(dir, name);
      const st = await lstat(full).catch(() => null);
      if (st === null) continue;
      const rel = path.relative(skillDir, full).split(path.sep).join("/");
      if (st.isDirectory()) {
        entries.push({ path: rel, kind: "dir", sizeBytes: 0 });
        const ok2 = await walk(full);
        if (!ok2) return false;
      } else if (st.isFile()) {
        entries.push({ path: rel, kind: "file", sizeBytes: st.size });
      }
    }
    return true;
  };
  try {
    await walk(skillDir);
  } catch {
    return { ok: false, code: "io-error", message: "读取 skill 目录失败: " + skillDir };
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === "dir" ? -1 : 1));
  return { ok: true, entries, truncated };
}

export type SkillFileReadResult =
  | { ok: true; content: string; sizeBytes: number; binary: false }
  | { ok: false; code: "not-found" | "too-large" | "binary" | "outside" | "io-error"; message: string };

/**
 * 读取单个文件(文本)。约束:
 * - 相对路径必须解析到 skillDir 之内,否则 outside(防穿越)
 * - 超过 MAX_FILE_BYTES → too-large(降级,不加载)
 * - 含 NUL 字节或解码失败 → binary(降级,不加载)
 */
export async function readSkillFile(skillDir: string, relPath: string): Promise<SkillFileReadResult> {
  const safe = path.resolve(skillDir, relPath);
  if (safe !== skillDir && !safe.startsWith(skillDir + path.sep)) {
    return { ok: false, code: "outside", message: "路径越出 skill 目录,已拒绝: " + relPath };
  }
  const st = await lstat(safe).catch(() => null);
  if (st === null || !st.isFile()) return { ok: false, code: "not-found", message: "文件不存在: " + relPath };
  if (st.size > MAX_FILE_BYTES) {
    return { ok: false, code: "too-large", message: "文件过大(" + st.size + " B,上限 " + MAX_FILE_BYTES + " B),已降级不加载" };
  }
  const buf = await readFile(safe).catch(() => null);
  if (buf === null) return { ok: false, code: "io-error", message: "读取失败: " + relPath };
  if (buf.includes(0)) return { ok: false, code: "binary", message: "二进制文件,已降级不渲染: " + relPath };
  return { ok: true, content: buf.toString("utf8"), sizeBytes: st.size, binary: false };
}
