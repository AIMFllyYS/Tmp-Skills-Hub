import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { copyVerifiedVariant } from "./conflicts.js";
import { moveDirSafe, unlinkNoFollow, writeFileAtomicSafe } from "./fs-atomic.js";
import { readGroups, writeGroups } from "./groups.js";
import { linkSkillDirName, readLinksLedger, writeLinksLedger } from "./links.js";
import { readSkillMeta } from "./skill-md.js";
import { isPortableSkillName } from "./skill-name.js";
import { migrateSkillStatsHash } from "./stats.js";
import { STORE_DATA_FILES } from "./store-layout.js";
import type { HubPaths } from "./store-location.js";
import { readStoreIndexFile, writeStoreIndex } from "./store.js";
import { uniqueTmpId } from "./tmp-id.js";
import type { SkillRecord, SkillSource } from "./types.js";

interface SkillRevision {
  dirName: string;
  hash: string;
  sourcePath: string;
  origins: SkillSource[];
  finalize?: () => Promise<unknown>;
}

/** Install a verified revision and restore the previous active directory and metadata on failure. */
export async function installSkillRevision(paths: HubPaths, revision: SkillRevision): Promise<SkillRecord> {
  if (!isPortableSkillName(revision.dirName)) throw new Error("非法技能目录名");
  const index = await readStoreIndexFile(paths);
  if (index.drafts.some((draft) => draft.dirName === revision.dirName)) throw new Error("已有同名草稿: " + revision.dirName);
  if (index.skills.some((skill) => skill.dirName !== revision.dirName && skill.hash === revision.hash)) {
    throw new Error("内容指纹已被另一技能使用");
  }
  const previous = index.skills.find((skill) => skill.dirName === revision.dirName);
  const tmp = path.join(paths.stateRoot, "tmp");
  await mkdir(tmp, { recursive: true });
  const stage = await mkdtemp(path.join(tmp, "revision-"));
  const staged = path.join(stage, "candidate");
  const active = path.join(paths.skillsRoot, revision.dirName);
  const versions = path.join(paths.stateRoot, "archive", "versions");
  const priorPath = path.join(versions, revision.dirName + "-" + uniqueTmpId());
  const previousFiles = new Map<string, Buffer>();
  let backedUpActive = false;
  let published = false;
  let metadataStarted = false;
  try {
    await copyVerifiedVariant(revision.sourcePath, staged, revision.hash);
    const meta = await readSkillMeta(staged);
    if (meta === null) throw new Error("版本缺少有效 SKILL.md");
    for (const name of STORE_DATA_FILES) {
      const file = path.join(paths.stateRoot, name);
      const contents = await readFile(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return Buffer.from("{}\n");
        throw error;
      });
      previousFiles.set(file, contents);
    }
    await mkdir(versions, { recursive: true });
    if (previous) {
      await moveDirSafe(active, priorPath);
      backedUpActive = true;
    }
    await moveDirSafe(staged, active);
    published = true;
    metadataStarted = true;
    const origins = [...(previous?.origins ?? [])];
    for (const source of revision.origins) {
      if (!origins.some((old) => old.kind === source.kind && old.reference === source.reference)) origins.push(source);
    }
    const record: SkillRecord = {
      hash: revision.hash, dirName: revision.dirName, meta, origins, visibleIn: [],
      installedAt: previous?.installedAt ?? new Date().toISOString(),
    };
    const oldHash = previous?.hash;
    if (oldHash !== undefined && oldHash !== revision.hash) {
      const groups = await readGroups(paths);
      for (const group of groups.groups) {
        group.memberHashes = [...new Set(group.memberHashes.map((hash) => hash === oldHash ? revision.hash : hash))];
      }
      await writeGroups(paths, groups);
      await migrateSkillStatsHash(paths, oldHash, revision.hash);
      const ledger = await readLinksLedger(paths);
      await writeLinksLedger(paths, ledger.map((entry) => linkSkillDirName(entry) === revision.dirName
        ? { ...entry, skillHash: revision.hash }
        : entry));
    }
    await writeStoreIndex(paths, [...index.skills.filter((entry) => entry.dirName !== record.dirName), record], index.drafts);
    await revision.finalize?.();
    return record;
  } catch (error) {
    const failures: unknown[] = [];
    const recover = async (action: () => Promise<void>) => action().catch((cause: unknown) => { failures.push(cause); });
    if (published) await recover(() => moveDirSafe(active, priorPath + "-failed"));
    if (backedUpActive) await recover(() => moveDirSafe(priorPath, active));
    if (metadataStarted) {
      for (const [file, contents] of previousFiles) await recover(() => writeFileAtomicSafe(file, contents));
    }
    if (failures.length > 0) throw new AggregateError([error, ...failures], "技能版本写入失败且部分回滚未完成", { cause: error });
    throw error;
  } finally {
    await unlinkNoFollow(stage);
  }
}
