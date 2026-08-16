import { link, lstat, mkdir, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 链接能力探测与悬空链接检测(doctor 命令的数据来源,只读语义)。
 * 探测在调用方给定的临时目录内进行,绝不触碰真实客户端目录。
 */

export interface LinkTypeProbe {
  /** 目录 junction(Windows 免提权) */
  junction: boolean;
  /** 目录符号链接 */
  symlink: boolean;
  /** 文件硬链接 */
  hardlink: boolean;
}

/**
 * 在 workDir 内实际创建三种链接并清理,返回各类型是否可用。
 * 链接目标缺失/权限不足时该类型为 false,不影响其余类型。
 */
export async function probeLinkTypes(workDir: string): Promise<LinkTypeProbe> {
  const targetDir = path.join(workDir, "probe-target");
  await mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, "file.txt");
  await writeFile(targetFile, "probe");
  const probeDir = path.join(workDir, "probe");
  await mkdir(probeDir, { recursive: true });

  const result: LinkTypeProbe = { junction: false, symlink: false, hardlink: false };

  try {
    await symlink(targetDir, path.join(probeDir, "junction"), "junction");
    result.junction = true;
  } catch {
    /* 无 junction 权限 */
  }
  try {
    await symlink(targetDir, path.join(probeDir, "symlink"), "dir");
    result.symlink = true;
  } catch {
    /* 无 symlink 权限(Windows 需提权) */
  }
  try {
    await link(targetFile, path.join(probeDir, "hardlink"));
    result.hardlink = true;
  } catch {
    /* 硬链接不可用(跨卷等) */
  }

  await rm(probeDir, { recursive: true, force: true });
  await rm(targetDir, { recursive: true, force: true });
  return result;
}

/**
 * 返回 p 的链接目标(绝对路径),p 是 symlink 或 Windows junction 时有效,否则 null。
 * 只读;失败(普通目录/文件/不存在)一律 null。
 */
export async function readLinkTarget(p: string): Promise<string | null> {
  try {
    const st = await lstat(p);
    if (st.isSymbolicLink()) {
      return path.resolve(path.dirname(p), await readlink(p));
    }
    if (st.isDirectory()) {
      // Windows junction:目录但 readlink 可解析
      return path.resolve(path.dirname(p), await readlink(p));
    }
    return null;
  } catch {
    return null;
  }
}

export interface DanglingLink {
  /** 链接所在客户端 skills 目录 */
  root: string;
  /** 链接绝对路径 */
  linkPath: string;
  /** 链接指向的目标(已失效) */
  target: string;
}

/**
 * 扫描各客户端 skills 根目录,找出目标已不存在的链接(symlink 与 junction)。
 * 只读:不删除、不修改任何内容。
 */
export async function findDanglingLinks(roots: string[]): Promise<DanglingLink[]> {
  const dangling: DanglingLink[] = [];
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const linkPath = path.join(root, entry.name);
      const target = await readLinkTarget(linkPath);
      if (target === null) continue;
      const targetOk = await statOk(target);
      if (!targetOk) {
        dangling.push({ root, linkPath, target });
      }
    }
  }
  return dangling;
}

async function statOk(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}
