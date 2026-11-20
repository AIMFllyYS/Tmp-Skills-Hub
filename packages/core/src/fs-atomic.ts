import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rename, rmdir, stat, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { uniqueTmpId } from "./tmp-id.js";

export async function writeFileAtomicSafe(target: string, data: string | Uint8Array): Promise<void> {
  const tmp = path.join(path.dirname(target), ".skills-hub-tmp-" + uniqueTmpId());
  await writeFile(tmp, data, { flag: "wx" }).catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") await unlink(tmp).catch(() => undefined);
    throw error;
  });
  try {
    await rename(tmp, target);
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

async function inspect(file: string) {
  return lstat(file).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
}

/** 摘链接不跟随，普通目录逐条摘除。 */
export async function unlinkNoFollow(file: string): Promise<void> {
  const entry = await inspect(file);
  if (entry === null) return;
  if (!entry.isDirectory()) {
    await unlink(file);
    return;
  }
  for (const name of await readdir(file)) await unlinkNoFollow(path.join(file, name));
  await rmdir(file);
}

/** Node 的 cp 在 Windows 上不能依靠普通 symlink 复制 junction。 */
export async function copyTreeJunctionSafe(source: string, dest: string): Promise<void> {
  const entry = await lstat(source);
  if (entry.isSymbolicLink()) {
    const link = await readlink(source);
    const target = await stat(source).catch(() => null);
    const type = process.platform === "win32" && target?.isDirectory()
      ? (path.isAbsolute(link) ? "junction" : "dir")
      : undefined;
    await symlink(link, dest, type);
    return;
  }
  if (entry.isDirectory()) {
    await mkdir(dest);
    for (const name of await readdir(source)) {
      await copyTreeJunctionSafe(path.join(source, name), path.join(dest, name));
    }
    return;
  }
  await cp(source, dest, { errorOnExist: true, force: false });
}

async function fileHash(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function sameTree(source: string, dest: string): Promise<boolean> {
  const [a, b] = await Promise.all([lstat(source), lstat(dest)]);
  if (a.isSymbolicLink()) return b.isSymbolicLink() && await readlink(source) === await readlink(dest);
  if (a.isFile()) return b.isFile() && a.size === b.size && await fileHash(source) === await fileHash(dest);
  if (!a.isDirectory() || !b.isDirectory()) return false;
  const [names, copies] = await Promise.all([readdir(source), readdir(dest)]);
  const copyNames = new Set(copies);
  if (names.length !== copyNames.size) return false;
  for (const name of names) {
    if (!copyNames.has(name) || !await sameTree(path.join(source, name), path.join(dest, name))) return false;
  }
  return true;
}

/** 跨卷时先发布经过逐文件校验的副本，再安全摘除原目录。 */
export async function moveDirSafe(
  source: string,
  dest: string,
  options?: { renameFn?: typeof rename },
): Promise<void> {
  if (!(await lstat(source)).isDirectory()) throw new Error(`源路径不是实体目录: ${source}`);
  const checkDest = async () => {
    if (await inspect(dest)) throw new Error(`目标已存在: ${dest}`);
  };
  await checkDest();
  try {
    await (options?.renameFn ?? rename)(source, dest);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }

  const destParent = await realpath(path.dirname(dest));
  const relative = path.relative(await realpath(source), destParent);
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))) {
    throw new Error(`目标目录位于源目录内: ${dest}`);
  }
  const staging = await mkdtemp(path.join(destParent, ".skills-hub-tmp-"));
  try {
    const copy = path.join(staging, "directory");
    await copyTreeJunctionSafe(source, copy);
    if (!await sameTree(source, copy)) throw new Error(`跨卷复制校验失败: ${source}`);
    await checkDest();
    await rename(copy, dest);
    await unlinkNoFollow(source);
  } finally {
    await unlinkNoFollow(staging);
  }
}

export async function computeDirDiskUsage(dir: string): Promise<{ bytes: number; files: number }> {
  const total = { bytes: 0, files: 0 };
  async function walk(file: string): Promise<void> {
    const entry = await inspect(file);
    if (entry?.isDirectory()) {
      for (const name of await readdir(file)) await walk(path.join(file, name));
    } else if (entry?.isFile()) {
      total.bytes += entry.size;
      total.files++;
    }
  }
  await walk(dir);
  return total;
}
