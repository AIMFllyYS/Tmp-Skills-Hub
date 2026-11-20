import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { moveDirSafe, writeFileAtomicSafe } from "./fs-atomic.js";
import { hashSkillFolder } from "./hash.js";
import { readLinkTarget } from "./link-probe.js";
import { applyLinkSet } from "./link-switch.js";
import { readLinksLedger, type LinkEntry } from "./links.js";
import type { DriftEntry } from "./reconcile-scan.js";
import type { HubPaths } from "./store-location.js";
import type { SkillRecord } from "./types.js";

export interface ReconcileFailure {
  clientId: string;
  skillName: string;
  reason: string;
  rolledBack: boolean;
}

export interface ReconcileLinkCandidate {
  source: DriftEntry;
  hash: string;
  skill: SkillRecord;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function reconcileLinkBatch(
  paths: HubPaths,
  runId: string,
  batchNumber: number,
  candidates: ReconcileLinkCandidate[],
  switchLinks: typeof applyLinkSet,
): Promise<{ linksCreated: number; externalLinksAdopted: number; failures: ReconcileFailure[] }> {
  const targetDir = candidates[0]!.source.skillsDir;
  const aside = path.join(paths.stateRoot, "tmp", "reconcile-aside-" + runId, String(batchNumber));
  const archive = path.join(paths.stateRoot, "archive", "reconcile", runId, String(batchNumber));
  const journal = path.join(aside, "journal.json");
  const before = await readLinksLedger(paths);
  const entries: LinkEntry[] = [];
  const rollbacks: Array<() => Promise<void>> = [];
  let current = candidates[0]!;
  try {
    await mkdir(aside, { recursive: true });
    const operations = candidates.map(({ source, hash, skill }) => ({
      path: source.entryPath, aside: path.join(aside, "originals", source.entryName), hash, skill: skill.dirName, target: source.target,
    }));
    await writeFileAtomicSafe(journal, JSON.stringify({ targetDir, operations }, null, 2) + "\n");
    for (const candidate of candidates) {
      current = candidate;
      const { source, skill, hash } = candidate;
      const actual = await lstat(source.entryPath);
      const stillReal = actual.isDirectory() && !actual.isSymbolicLink();
      if (source.kind === "external-symlink") {
        const target = await readLinkTarget(source.entryPath);
        if (target === null || target !== source.target) throw new Error("外部链接目标已变化，请重新扫描。");
      } else if (!stillReal) {
        throw new Error("候选路径已不再是普通目录。");
      }
      if (await hashSkillFolder(source.entryPath) !== hash) throw new Error("候选内容已变化，请重新扫描。");
      if (source.kind === "external-symlink") {
        const original = await readlink(source.entryPath);
        const local = process.platform === "win32" && path.isAbsolute(original) ? "junction" : "dir";
        await unlink(source.entryPath);
        rollbacks.push(() => symlink(original, source.entryPath, local));
      } else {
        const dest = path.join(aside, "originals", source.entryName);
        await mkdir(path.dirname(dest), { recursive: true });
        await moveDirSafe(source.entryPath, dest);
        rollbacks.push(() => moveDirSafe(dest, source.entryPath));
      }
      const previous = before.find((entry) => entry.targetDir === targetDir && entry.entryName === source.entryName);
      entries.push({
        id: previous?.id ?? `reconcile:${source.clientId}:${targetDir}:${source.entryName}`,
        clientId: source.clientId, scope: previous?.scope ?? "global", targetDir,
        entryName: source.entryName,
        ...(skill.dirName === source.entryName ? {} : { skillDirName: skill.dirName }),
        skillHash: skill.hash, kind: process.platform === "win32" ? "junction" : "symlink",
        createdAt: previous?.createdAt ?? new Date().toISOString(),
      });
    }
    const outcome = await switchLinks(paths, { targetDir, entries }, { entryNames: new Set(entries.map((entry) => entry.entryName)) });
    if (!outcome.ok) throw new Error(outcome.message);
    const result = {
      linksCreated: outcome.created.length,
      externalLinksAdopted: candidates.filter(({ source }) => source.kind === "external-symlink").length,
      failures: [] as ReconcileFailure[],
    };
    try {
      await mkdir(path.dirname(archive), { recursive: true });
      await moveDirSafe(aside, archive);
    } catch (error) {
      result.failures.push({ clientId: current.source.clientId, skillName: current.skill.dirName, reason: "原副本仍保留在 " + aside + "，归档失败: " + message(error), rolledBack: false });
    }
    return result;
  } catch (error) {
    const failed: string[] = [];
    for (const rollback of rollbacks.reverse()) {
      await rollback().catch((cause: unknown) => { failed.push(message(cause)); });
    }
    const reason = message(error);
    return {
      linksCreated: 0,
      externalLinksAdopted: 0,
      failures: candidates.map(({ source, skill }) => ({
        clientId: source.clientId, skillName: skill.dirName,
        reason: (skill.dirName === current.skill.dirName ? reason : "同客户端批次已中止: " + reason) +
          (failed.length === 0 ? "" : "。回滚异常，原件旁路: " + aside + "，" + failed.join(" | ")),
        rolledBack: failed.length === 0,
      })),
    };
  }
}
