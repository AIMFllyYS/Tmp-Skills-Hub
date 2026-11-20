import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import {
  applyLinkSet,
  copyTreeJunctionSafe,
  discoverClientRoots,
  hashSkillFolder,
  linkSkillDirName,
  readHubConfig,
  readLinksLedger,
  readLinkTarget,
  readStoreIndexFile,
  unlinkNoFollow,
  writeFileAtomicSafe,
  writeHubConfig,
  writeLinksLedger,
  type HubPaths,
  type LinkEntry,
} from "@skills-hub/core";
import { POINTER_REL } from "./store-shared.js";

function inside(root: string, sub: string): boolean {
  const relative = path.relative(root, sub);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function missing<T>(error: NodeJS.ErrnoException): T | null {
  if (error.code === "ENOENT") return null;
  throw error;
}

/** Resolve existing ancestors without creating the destination during dry-run. */
async function canonical(target: string): Promise<string> {
  const real = await realpath(target).catch(missing<string>);
  if (real !== null) return real;
  const parent = path.dirname(target);
  if (parent === target) throw new Error("路径所在卷不可达: " + target);
  return path.join(await canonical(parent), path.basename(target));
}

type TargetResult =
  | { ok: true; target: string; existing: boolean }
  | { ok: false; code: "bad-usage" | "conflict"; message: string };

export async function validateSkillsRoot(
  home: string,
  stateRoot: string,
  rawTarget: string,
  oldSkillsRoot?: string,
  ledger: readonly LinkEntry[] = [],
): Promise<TargetResult> {
  if (!path.isAbsolute(rawTarget)) return { ok: false, code: "bad-usage", message: "唯一真源路径必须是绝对路径。" };
  const dest = path.resolve(rawTarget);
  const realTarget = await canonical(dest);
  const state = await canonical(stateRoot);
  const source = oldSkillsRoot ? await canonical(oldSkillsRoot) : null;
  const clients = await discoverClientRoots(home);
  const protectedPaths = [...clients.map((client) => client.skillsDir), ...ledger.map((entry) => entry.targetDir)];
  if (inside(realTarget, state) || (inside(state, realTarget) && path.relative(path.join(state, "skills"), realTarget) !== "")) {
    return { ok: false, code: "bad-usage", message: "目标路径与控制中心重叠。" };
  }
  if (source && (inside(source, realTarget) || inside(realTarget, source))) {
    return { ok: false, code: "bad-usage", message: "目标路径与当前真源重叠。" };
  }
  if (inside(realTarget, await canonical(home))) {
    return { ok: false, code: "bad-usage", message: "目标不能是 home 根目录或其祖先。" };
  }
  for (const candidate of protectedPaths) {
    const client = await canonical(candidate);
    if (inside(client, realTarget) || inside(realTarget, client)) {
      return { ok: false, code: "bad-usage", message: "目标路径与客户端目录重叠。" };
    }
  }
  const item = await lstat(dest).catch(missing<Awaited<ReturnType<typeof lstat>>>);
  if (item !== null && (!item.isDirectory() || (await readdir(dest)).length !== 0)) {
    return { ok: false, code: "conflict", message: "目标已存在，必须为空的实体目录。" };
  }
  return { ok: true, target: realTarget, existing: item !== null };
}

interface MigrateOptions {
  home: string;
  paths: HubPaths;
  targetSkillsRoot: string;
  dryRun?: boolean;
  /** 针对跨落点回滚的故障注入。 */
  switchLinks?: typeof applyLinkSet;
}

export async function performMigrate({ home, paths, targetSkillsRoot, dryRun = false, switchLinks = applyLinkSet }: MigrateOptions) {
  const source = await lstat(paths.skillsRoot).catch(missing<Awaited<ReturnType<typeof lstat>>>);
  if (!source?.isDirectory()) return { ok: false, code: "bad-usage", message: "当前真源必须是实体目录。" } as const;
  const sourceRoot = await canonical(paths.skillsRoot);
  const ledger = await readLinksLedger(paths);
  const validation = await validateSkillsRoot(home, paths.stateRoot, targetSkillsRoot, paths.skillsRoot, ledger);
  if (!validation.ok) return validation;
  const next: HubPaths = { ...paths, skillsRoot: validation.target, layoutMode: "split" };
  const linkGroups = new Map<string, LinkEntry[]>();
  for (const entry of ledger) {
    const batch = linkGroups.get(entry.targetDir) ?? [];
    batch.push(entry);
    linkGroups.set(entry.targetDir, batch);
    if (entry.kind === "copy") continue;
    const link = await readLinkTarget(path.join(entry.targetDir, entry.entryName));
    const expected = path.join(sourceRoot, linkSkillDirName(entry));
    if (link === null || path.relative(expected, await canonical(link)) !== "") {
      return { ok: false, code: "conflict", message: "链接落点已变化，请检查并清理台账: " + path.join(entry.targetDir, entry.entryName) } as const;
    }
  }
  const index = await readStoreIndexFile(paths);
  const names = [...index.skills, ...index.drafts].map((skill) => skill.dirName);
  const movedLinks = ledger.filter((entry) => entry.kind !== "copy").length;
  if (dryRun) return { ok: true, dryRun, paths: next, movedLinks, skills: names.length, aside: null } as const;

  const pointer = path.join(home, POINTER_REL);
  const originalConfig = await readFile(pointer).catch(missing<Buffer>);
  const config = await readHubConfig(pointer);
  const aside = paths.skillsRoot + ".pre-migrate-" + new Date().toISOString().replace(/[:.]/g, "-");
  const parent = path.dirname(next.skillsRoot);
  await mkdir(parent, { recursive: true });
  await mkdir(path.dirname(pointer), { recursive: true });
  const stage = await mkdtemp(path.join(parent, ".skills-hub-migrate-"));
  const staged = path.join(stage, "assets");
  let published = false;
  let emptiedTarget = false;
  let wroteConfig = false;
  const switched: [string, LinkEntry[]][] = [];
  try {
    await copyTreeJunctionSafe(paths.skillsRoot, staged);
    for (const name of names) {
      const [sourceHash, copyHash] = await Promise.all([paths.skillsRoot, staged].map(
        (root) => hashSkillFolder(path.join(root, name)),
      ));
      if (sourceHash !== copyHash) throw new Error("迁移副本哈希不符: " + name);
    }
    if (validation.existing) {
      await rmdir(next.skillsRoot);
      emptiedTarget = true;
    } else if (await lstat(next.skillsRoot).catch(missing<Awaited<ReturnType<typeof lstat>>>) !== null) {
      throw new Error("迁移期间目标目录已出现: " + next.skillsRoot);
    }
    await rename(staged, next.skillsRoot);
    published = true;
    for (const [targetDir, entries] of linkGroups) {
      if (entries.every((entry) => entry.kind === "copy")) continue;
      const result = await switchLinks(next, { targetDir, entries }, { previousSkillsRoot: paths.skillsRoot, preserveCopies: true });
      if (!result.ok) throw new Error("链接切换失败: " + result.message);
      switched.push([targetDir, entries]);
    }
    await writeHubConfig(pointer, {
      ...config,
      version: 2,
      storeRoot: paths.stateRoot,
      stateRoot: paths.stateRoot,
      skillsRoot: next.skillsRoot,
    });
    wroteConfig = true;
    await rename(paths.skillsRoot, aside);
    return { ok: true, dryRun, paths: next, movedLinks, skills: names.length, aside } as const;
  } catch (error) {
    const failures: string[] = [];
    const recover = async (action: () => Promise<unknown>) => {
      try { await action(); }
      catch (cause) { failures.push(cause instanceof Error ? cause.message : String(cause)); }
    };
    if (wroteConfig) {
      await recover(() => originalConfig === null ? unlink(pointer) : writeFileAtomicSafe(pointer, originalConfig));
    }
    for (const [targetDir, entries] of switched.reverse()) {
      await recover(async () => {
        const rollback = await applyLinkSet(paths, { targetDir, entries }, { previousSkillsRoot: next.skillsRoot, preserveCopies: true });
        if (!rollback.ok) throw new Error(rollback.message);
      });
    }
    if (switched.length > 0) await recover(() => writeLinksLedger(paths, ledger));
    if (failures.length === 0 && published) {
      await recover(() => rename(next.skillsRoot, next.skillsRoot + ".pre-migrate-failed-" + path.basename(stage)));
    }
    if (failures.length === 0 && emptiedTarget) await recover(() => mkdir(next.skillsRoot));
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "io-error",
      message: failures.length > 0 ? message + "。回滚异常: " + failures.join(" | ") : message,
    } as const;
  } finally {
    await unlinkNoFollow(stage).catch(() => undefined);
  }
}
