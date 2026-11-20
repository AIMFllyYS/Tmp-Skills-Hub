import { cp, lstat, mkdir, readdir, readFile, rename, symlink, utimes, writeFile } from "node:fs/promises";
import { copyTreeJunctionSafe, unlinkNoFollow } from "./fs-atomic.js";
import path from "node:path";
import { normalizeHubPaths, type HubPaths } from "./store-location.js";
import { discoverClientRoots, isOwnClientId } from "./clients.js";
import { readLinkTarget } from "./link-probe.js";
import { STORE_TMP_DIR } from "./store-layout.js";
import { uniqueSuffix } from "./tmp-id.js";
import {
  readLatestSnapshotId,
  STORE_BACKUPS_DIR,
  verifyBackupSnapshot,
  type BackupFileEntry,
  type BackupLinkEntry,
  type BackupManifest,
  type BackupVerifyIssue,
} from "./backup.js";

function skillNameOf(rel: string): string {
  const first = rel.split("/").find((s) => s !== "");
  return first ?? "";
}

export function isBlobBackupManifest(raw: unknown): raw is BackupManifest {
  if (typeof raw !== "object" || raw === null) return false;
  const m = raw as Record<string, unknown>;
  return Array.isArray(m.files) && Array.isArray(m.links) && typeof m.snapshotId === "string";
}

export interface RestoreSkillItem {
  clientId: string;
  skill: string;
  dest: string;
  kind: "files" | "link";
  fileCount: number;
  linkTarget?: string;
}

export interface RestorePreview {
  snapshotId: string;
  format: "blobs" | "roots";
  clients: number;
  skills: number;
  files: number;
  links: number;
  wouldRestore: RestoreSkillItem[];
  skippedOwnDirs: string[];
}

export interface RestoreOk extends RestorePreview {
  ok: true;
  asideDir: string;
}

export interface RestoreFailed {
  ok: false;
  code: "not-found" | "verify-failed" | "restore-failed";
  message: string;
  snapshotId: string;
  issues?: BackupVerifyIssue[];
}

export type RestoreResult = RestoreOk | RestoreFailed;

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function readRawManifest(snapshotDir: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(snapshotDir, "manifest.json"), "utf8")) as unknown;
}

const ROOTS_REL_SKILLS = ["skills", "skills-cursor", "antigravity/skills", "config/skills"] as const;
const RETRYABLE_RENAME_CODES = new Set(["EXDEV", "EPERM", "EACCES", "EBUSY", "EEXIST"]);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export { unlinkNoFollow } from "./fs-atomic.js";

export interface AsideOps {
  renameFn?: (oldPath: string, newPath: string) => Promise<void>;
  unlinkFn?: (p: string) => Promise<void>;
  retryDelayMs?: number;
}

function isRetryableRenameError(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  return code !== undefined && RETRYABLE_RENAME_CODES.has(code);
}

function asideFailedError(src: string, cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `无法将技能目录 "${src}" 暂存到旁路目录（可能被 IDE 或终端占用锁定）；请关闭相关进程后安全重试（原内容未被删除）。原因: ${reason}`,
    { cause },
  );
}

async function uniqueAsideDest(dir: string, name: string): Promise<string> {
  const base = path.join(dir, name);
  if (!(await exists(base))) return base;
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${name}-${i}`);
    if (!(await exists(candidate))) return candidate;
  }
  return path.join(dir, `${name}-${uniqueSuffix()}`);
}

/**
 * 链接摘掉不跟随;普通目录先 rename 到库存 tmp,遇跨卷/占用先落同盘旁路并短重试,
 * 仍失败则退回 cp(localDest) + unlinkNoFollow(src);绝不整目录 rename 客户端 skills,绝不真删。
 */
export async function asideSkill(
  src: string,
  storeAside: string,
  localAside: string,
  name: string,
  ops?: AsideOps,
): Promise<void> {
  const renameFn = ops?.renameFn ?? rename;
  const unlinkFn = ops?.unlinkFn ?? unlinkNoFollow;
  const retryDelayMs = ops?.retryDelayMs ?? 100;

  if ((await readLinkTarget(src)) !== null) {
    try {
      await unlinkFn(src);
    } catch (e) {
      throw asideFailedError(src, e);
    }
    return;
  }

  const storeDest = await uniqueAsideDest(storeAside, name);
  await mkdir(path.dirname(storeDest), { recursive: true });
  try {
    await renameFn(src, storeDest);
    return;
  } catch (e) {
    if (!isRetryableRenameError(e)) throw asideFailedError(src, e);
  }

  await mkdir(localAside, { recursive: true });
  const tryLocalRename = async (): Promise<{ ok: true } | { ok: false; err: unknown }> => {
    const dest = await uniqueAsideDest(localAside, name);
    try {
      await renameFn(src, dest);
      return { ok: true };
    } catch (err) {
      return { ok: false, err };
    }
  };

  let lastRes = await tryLocalRename();
  if (lastRes.ok) return;
  if (!isRetryableRenameError(lastRes.err)) throw asideFailedError(src, lastRes.err);

  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(retryDelayMs);
    lastRes = await tryLocalRename();
    if (lastRes.ok) return;
    if (!isRetryableRenameError(lastRes.err)) throw asideFailedError(src, lastRes.err);
  }

  const cpDest = await uniqueAsideDest(localAside, name);
  try {
    await cp(src, cpDest, { recursive: true, verbatimSymlinks: true });
  } catch (cpErr) {
    const err = cpErr as NodeJS.ErrnoException;
    if (process.platform === "win32" && err.code === "EPERM" && err.syscall === "symlink") {
      await unlinkNoFollow(cpDest).catch(() => undefined);
      try {
        await copyTreeJunctionSafe(src, cpDest);
      } catch (fallbackErr) {
        await unlinkNoFollow(cpDest).catch(() => undefined);
        throw asideFailedError(src, fallbackErr);
      }
    } else {
      await unlinkNoFollow(cpDest).catch(() => undefined);
      throw asideFailedError(src, cpErr);
    }
  }
  try {
    await unlinkFn(src);
  } catch (unlinkErr) {
    throw asideFailedError(src, unlinkErr);
  }
}

async function resolveSkillsDir(
  home: string,
  storeRoot: string | HubPaths,
  clientId: string,
  skill: string,
): Promise<string> {
  const roots = await discoverClientRoots(home, { storeRoot });
  const matches = roots.filter((r) => r.clientId === clientId);
  if (matches.length === 0) {
    if (clientId === "antigravity") return path.join(home, ".gemini", "config", "skills");
    return path.join(home, "." + clientId, "skills");
  }
  if (matches.length === 1) return matches[0]!.skillsDir;
  for (const r of matches) {
    if (await exists(path.join(r.skillsDir, skill))) return r.skillsDir;
  }
  const canonical = matches.find((r) => {
    const n = r.skillsDir.replace(/\\/g, "/");
    if (clientId === "antigravity") return n.endsWith("/.gemini/config/skills");
    return (
      n.endsWith("/skills") &&
      !n.includes("skills-cursor") &&
      !n.includes("antigravity") &&
      !n.endsWith("/config/skills")
    );
  });
  return (canonical ?? matches[0]!).skillsDir;
}

function snapshotDirOf(storeRoot: string | HubPaths, snapshotId: string): string {
  return path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_BACKUPS_DIR, snapshotId);
}

export async function resolveRestoreSnapshotId(storeRoot: string | HubPaths, snapshotId?: string): Promise<string | null> {
  if (snapshotId !== undefined && snapshotId !== "") return snapshotId;
  return readLatestSnapshotId(storeRoot);
}

async function previewBlob(
  storeRoot: string | HubPaths,
  home: string,
  snapshotId: string,
  manifest: BackupManifest,
): Promise<RestorePreview> {
  const skippedOwnDirs: string[] = [];
  const bySkill = new Map<string, { files: BackupFileEntry[]; link: BackupLinkEntry | undefined }>();
  const add = (clientId: string, skill: string): { files: BackupFileEntry[]; link: BackupLinkEntry | undefined } => {
    const key = clientId + "\0" + skill;
    const cur = bySkill.get(key);
    if (cur !== undefined) return cur;
    const created = { files: [] as BackupFileEntry[], link: undefined as BackupLinkEntry | undefined };
    bySkill.set(key, created);
    return created;
  };
  for (const f of manifest.files) {
    if (isOwnClientId(f.clientId)) {
      if (!skippedOwnDirs.includes(f.clientId)) skippedOwnDirs.push(f.clientId);
      continue;
    }
    const skill = skillNameOf(f.rel);
    if (skill === "") continue;
    add(f.clientId, skill).files.push(f);
  }
  for (const l of manifest.links) {
    if (isOwnClientId(l.clientId)) {
      if (!skippedOwnDirs.includes(l.clientId)) skippedOwnDirs.push(l.clientId);
      continue;
    }
    const skill = skillNameOf(l.rel);
    if (skill === "" || skill !== l.rel) continue;
    add(l.clientId, skill).link = l;
  }
  const wouldRestore: RestoreSkillItem[] = [];
  for (const [key, group] of bySkill) {
    const [clientId, skill] = key.split("\0");
    if (clientId === undefined || skill === undefined) continue;
    const skillsDir = await resolveSkillsDir(home, storeRoot, clientId, skill);
    const dest = path.join(skillsDir, skill);
    if (group.link !== undefined) {
      wouldRestore.push({
        clientId,
        skill,
        dest,
        kind: "link",
        fileCount: 0,
        linkTarget: group.link.target,
      });
    } else {
      wouldRestore.push({ clientId, skill, dest, kind: "files", fileCount: group.files.length });
    }
  }
  const clients = new Set(wouldRestore.map((i) => i.clientId)).size;
  return {
    snapshotId,
    format: "blobs",
    clients,
    skills: wouldRestore.length,
    files: wouldRestore.reduce((n, i) => n + i.fileCount, 0),
    links: wouldRestore.filter((i) => i.kind === "link").length,
    wouldRestore,
    skippedOwnDirs,
  };
}

async function previewRoots(snapshotDir: string, home: string, snapshotId: string): Promise<RestorePreview> {
  const rootsDir = path.join(snapshotDir, "roots");
  const skippedOwnDirs: string[] = [];
  const wouldRestore: RestoreSkillItem[] = [];
  const clientNames = await readdir(rootsDir).catch(() => [] as string[]);
  for (const clientId of clientNames) {
    if (isOwnClientId(clientId)) {
      skippedOwnDirs.push(clientId);
      continue;
    }
    const clientSnap = path.join(rootsDir, clientId);
    if (!(await isDir(clientSnap))) continue;
    const dots = await readdir(clientSnap);
    for (const dot of dots) {
      if (isOwnClientId(dot.replace(/^\.+/, ""))) {
        if (!skippedOwnDirs.includes(dot)) skippedOwnDirs.push(dot);
        continue;
      }
      for (const relSkills of ROOTS_REL_SKILLS) {
        const srcSkills = path.join(clientSnap, dot, ...relSkills.split("/"));
        if (!(await isDir(srcSkills))) continue;
        const destSkills = path.join(home, dot, ...relSkills.split("/"));
        const names = await readdir(srcSkills);
        for (const skill of names) {
          const src = path.join(srcSkills, skill);
          const st = await lstat(src).catch(() => null);
          if (st === null || (!st.isDirectory() && !st.isSymbolicLink())) continue;
          wouldRestore.push({
            clientId,
            skill,
            dest: path.join(destSkills, skill),
            kind: "files",
            fileCount: 1,
          });
        }
      }
    }
  }
  return {
    snapshotId,
    format: "roots",
    clients: new Set(wouldRestore.map((i) => i.clientId)).size,
    skills: wouldRestore.length,
    files: wouldRestore.length,
    links: 0,
    wouldRestore,
    skippedOwnDirs,
  };
}

export async function previewRestoreClientSkills(
  storeRoot: string | HubPaths,
  home: string,
  snapshotId?: string,
): Promise<RestoreResult> {
  const id = await resolveRestoreSnapshotId(storeRoot, snapshotId);
  if (id === null) {
    return { ok: false, code: "not-found", message: "没有可还原的备份快照", snapshotId: "" };
  }
  const snapshotDir = snapshotDirOf(storeRoot, id);
  if (!(await exists(path.join(snapshotDir, "manifest.json")))) {
    return { ok: false, code: "not-found", message: "快照不存在: " + id, snapshotId: id };
  }
  const report = await verifyBackupSnapshot(storeRoot, id);
  if (!report.ok) {
    return {
      ok: false,
      code: "verify-failed",
      message: "快照校验失败: " + id,
      snapshotId: id,
      issues: report.issues,
    };
  }
  const raw = await readRawManifest(snapshotDir);
  const preview = isBlobBackupManifest(raw)
    ? await previewBlob(storeRoot, home, id, raw)
    : await previewRoots(snapshotDir, home, id);
  return { ok: true, asideDir: "", ...preview };
}

async function writeBlobFiles(
  storeRoot: string | HubPaths,
  destSkill: string,
  files: BackupFileEntry[],
): Promise<void> {
  const blobsDir = path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_BACKUPS_DIR, "blobs");
  await mkdir(destSkill, { recursive: true });
  for (const f of files) {
    const dest = path.join(path.dirname(destSkill), ...f.rel.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    const buf = await readFile(path.join(blobsDir, f.hash));
    await writeFile(dest, buf);
    if (Number.isFinite(f.mtimeMs)) await utimes(dest, new Date(f.mtimeMs), new Date(f.mtimeMs));
  }
}

async function recreateLink(dest: string, target: string, _kind: BackupLinkEntry["kind"]): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  if (await exists(dest)) await unlinkNoFollow(dest);
  // Windows 目录链接优先 junction,避免把 junction 误判成需提权的 symlink。
  const type = process.platform === "win32" ? "junction" : "dir";
  await symlink(target, dest, type);
}

async function applyBlobRestore(
  storeRoot: string | HubPaths,
  runId: string,
  asideRoot: string,
  manifest: BackupManifest,
  preview: RestorePreview,
): Promise<void> {
  for (const item of preview.wouldRestore) {
    if (await exists(item.dest)) {
      const localAside = path.join(path.dirname(path.dirname(item.dest)), ".skills-hub.restore-aside", runId);
      await asideSkill(item.dest, asideRoot, localAside, item.clientId + "-" + item.skill);
    }
    if (item.kind === "link" && item.linkTarget !== undefined) {
      const link = manifest.links.find((l) => l.clientId === item.clientId && l.rel === item.skill);
      await recreateLink(item.dest, item.linkTarget, link?.kind ?? "junction");
      continue;
    }
    const files = manifest.files.filter((f) => f.clientId === item.clientId && skillNameOf(f.rel) === item.skill);
    await writeBlobFiles(storeRoot, item.dest, files);
  }
}

async function applyRootsRestore(
  runId: string,
  asideRoot: string,
  snapshotDir: string,
  preview: RestorePreview,
): Promise<void> {
  const rootsDir = path.join(snapshotDir, "roots");
  for (const item of preview.wouldRestore) {
    const destSkills = path.dirname(item.dest);
    const srcGuess = await findOldSkillSrc(rootsDir, item);
    if (srcGuess === null) continue;
    if (await exists(item.dest)) {
      const localAside = path.join(path.dirname(destSkills), ".skills-hub.restore-aside", runId);
      await asideSkill(item.dest, asideRoot, localAside, item.clientId + "-" + item.skill);
    }
    await mkdir(destSkills, { recursive: true });
    await cp(srcGuess, item.dest, { recursive: true, verbatimSymlinks: true });
  }
}

async function findOldSkillSrc(rootsDir: string, item: RestoreSkillItem): Promise<string | null> {
  const clientSnap = path.join(rootsDir, item.clientId);
  const dots = await readdir(clientSnap).catch(() => [] as string[]);
  for (const dot of dots) {
    for (const relSkills of ROOTS_REL_SKILLS) {
      const src = path.join(clientSnap, dot, ...relSkills.split("/"), item.skill);
      if (await exists(src)) {
        const destNorm = item.dest.replace(/\\/g, "/");
        const suffix = (relSkills + "/" + item.skill).replace(/\\/g, "/");
        if (destNorm.endsWith(suffix) || destNorm.endsWith(item.skill)) return src;
      }
    }
  }
  return null;
}

/** 按快照逐条写回客户端 skill 落点。禁止整目录 rename 客户端 skills。 */
export async function restoreClientSkills(
  storeRoot: string | HubPaths,
  home: string,
  snapshotId?: string,
): Promise<RestoreResult> {
  const preview = await previewRestoreClientSkills(storeRoot, home, snapshotId);
  if (!preview.ok) return preview;
  const snapshotDir = snapshotDirOf(storeRoot, preview.snapshotId);
  const runId = preview.snapshotId + "-" + uniqueSuffix();
  const asideDir = path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_TMP_DIR, "restore-aside-" + runId);
  try {
    const raw = await readRawManifest(snapshotDir);
    if (isBlobBackupManifest(raw)) await applyBlobRestore(storeRoot, runId, asideDir, raw, preview);
    else await applyRootsRestore(runId, asideDir, snapshotDir, preview);
  } catch (e) {
    return {
      ok: false,
      code: "restore-failed",
      message: e instanceof Error ? e.message : String(e),
      snapshotId: preview.snapshotId,
    };
  }
  return { ...preview, asideDir };
}
