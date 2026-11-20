import { realpath } from "node:fs/promises";
import path from "node:path";
import { createBackupSnapshot, verifyBackupSnapshot, STORE_BACKUPS_DIR } from "./backup.js";
import { recordConflict, storeConflictVariant, withConflictWriteLock, type ConflictRecord, type ConflictVariant } from "./conflicts.js";
import { inspectClientPath } from "./link-probe.js";
import { applyLinkSet } from "./link-switch.js";
import { readLinksLedger, writeLinksLedger } from "./links.js";
import { reconcileLinkBatch, type ReconcileFailure, type ReconcileLinkCandidate } from "./reconcile-links.js";
import { inspectDriftL2, scanClientDriftL1, type DriftEntry, type DriftL1Report, type DriftSkill } from "./reconcile-scan.js";
import { installSkillRevision } from "./skill-revision.js";
import { adoptSkillFolder } from "./store.js";
import type { HubPaths } from "./store-location.js";
import { uniqueTmpId } from "./tmp-id.js";
import type { SkillRecord, SkillSource } from "./types.js";

interface ReconcileOptions {
  includeExternalLinks?: boolean;
  pruneDangling?: boolean;
}

interface ExecuteOptions extends ReconcileOptions {
  /** Optional deterministic fault injection for IO and rollback tests. */
  verifyBackup?: typeof verifyBackupSnapshot;
  switchLinks?: typeof applyLinkSet;
}

export interface ReconcilePlan {
  backupRequired: true;
  backupDir: string;
  skillsRoot: string;
  scan: DriftL1Report;
  toAdopt: DriftSkill[];
  toRelinkIdentical: DriftSkill[];
  conflicts: DriftSkill[];
  skippedExternalLinks: DriftEntry[];
  untouchedNonSkill: DriftEntry[];
  danglingToPrune: number;
}

export async function planReconcile(home: string, paths: HubPaths, options?: ReconcileOptions): Promise<ReconcilePlan> {
  const scan = await scanClientDriftL1(home, paths);
  const inspected = await inspectDriftL2(scan, paths, options);
  return {
    backupRequired: true,
    backupDir: path.join(paths.stateRoot, STORE_BACKUPS_DIR),
    skillsRoot: paths.skillsRoot,
    scan,
    toAdopt: inspected.skills.filter((skill) => skill.kind === "new-skill"),
    toRelinkIdentical: inspected.skills.filter((skill) => skill.kind === "identical-to-store"),
    conflicts: inspected.skills.filter((skill) => skill.kind === "name-conflict"),
    skippedExternalLinks: inspected.skippedExternalLinks,
    untouchedNonSkill: [...scan.entries.filter((entry) => entry.kind === "non-skill-entry"), ...inspected.incomplete],
    danglingToPrune: scan.entries.filter((entry) => entry.kind === "dangling-link" && entry.registered).length,
  };
}

export interface ReconcileResult {
  ok: true;
  snapshotId: string;
  backupVerified: true;
  adoptedCount: number;
  relinkedCount: number;
  linksCreated: number;
  conflictCount: number;
  externalLinksAdopted: number;
  skippedExternalLinks: number;
  danglingPruned: number;
  failures: ReconcileFailure[];
}

export interface ReconcileError {
  ok: false;
  code: "verify-failed" | "io-error";
  message: string;
  snapshotId?: string;
}

function sourcesFor(skill: DriftSkill): SkillSource[] {
  return skill.variants.flatMap(({ sources }) => sources.map((source) => ({ kind: "local-scan", reference: source.entryPath })));
}

async function prepareSkill(paths: HubPaths, skill: DriftSkill): Promise<SkillRecord> {
  const winner = skill.variants[0]!;
  const revision = { dirName: skill.skillName, hash: winner.hash, sourcePath: winner.sourcePath, origins: sourcesFor(skill) };
  if (skill.kind === "new-skill") {
    const adopted = await adoptSkillFolder(paths, await realpath(winner.sourcePath), { kind: "local-scan", reference: winner.sourcePath }, {
      expected: { hash: winner.hash, dirName: skill.skillName },
    });
    if ((adopted.kind === "adopted" || adopted.kind === "duplicate") && adopted.record.dirName === skill.skillName) {
      return adopted.record;
    }
    throw new Error(adopted.kind === "invalid" ? adopted.reason : "出现库存名称或指纹冲突，请重新扫描");
  }
  if (skill.kind === "identical-to-store" && skill.storeSkill?.hash === winner.hash) return skill.storeSkill;
  if (skill.kind !== "name-conflict") return installSkillRevision(paths, revision);

  const now = new Date().toISOString();
  const variants: ConflictVariant[] = [];
  for (const source of skill.variants) {
    const variant = {
      variantId: source.hash.slice(0, 12), hash: source.hash,
      sourceClients: source.sourceClients, maxMtimeMs: source.maxMtimeMs,
      fileCount: source.fileCount, totalBytes: source.totalBytes, detectedAt: now,
    };
    await storeConflictVariant(paths, skill.skillName, variant, source.sourcePath);
    variants.push(variant);
  }
  const conflict: ConflictRecord = {
    skillName: skill.skillName, activeHash: winner.hash, variants,
    shorterContentWarning: skill.shorterContentWarning, createdAt: now, updatedAt: now,
  };
  const finalize = () => recordConflict(paths, conflict);
  if (winner.inStore && skill.storeSkill?.hash === winner.hash) {
    await finalize();
    return skill.storeSkill;
  }
  return installSkillRevision(paths, { ...revision, finalize });
}

export async function executeReconcile(home: string, paths: HubPaths, options: ExecuteOptions = {}): Promise<ReconcileResult | ReconcileError> {
  try {
    return await withConflictWriteLock(paths, () => executeLockedReconcile(home, paths, options));
  } catch (error) {
    return { ok: false, code: "io-error", message: error instanceof Error ? error.message : String(error) };
  }
}

async function executeLockedReconcile(home: string, paths: HubPaths, options: ExecuteOptions): Promise<ReconcileResult | ReconcileError> {
  const plan = await planReconcile(home, paths, options);
  const backup = await createBackupSnapshot(paths, home);
  const verified = await (options.verifyBackup ?? verifyBackupSnapshot)(paths, backup.snapshotId);
  if (!verified.ok) {
    return {
      ok: false, code: "verify-failed", snapshotId: backup.snapshotId,
      message: "备份校验失败: " + verified.issues.map((issue) => issue.reason).join(", "),
    };
  }
  const batches = new Map<string, ReconcileLinkCandidate[]>();
  const result: ReconcileResult = {
    ok: true, snapshotId: backup.snapshotId, backupVerified: true, adoptedCount: 0, relinkedCount: 0,
    linksCreated: 0, conflictCount: 0, externalLinksAdopted: 0, danglingPruned: 0,
    skippedExternalLinks: plan.skippedExternalLinks.length, failures: [],
  };
  for (const skill of [...plan.toAdopt, ...plan.toRelinkIdentical, ...plan.conflicts]) {
    try {
      const active = await prepareSkill(paths, skill);
      if (skill.kind === "new-skill") result.adoptedCount++;
      if (skill.kind === "name-conflict") result.conflictCount++;
      for (const variant of skill.variants) {
        for (const source of variant.sources) {
          const batch = batches.get(source.skillsDir) ?? [];
          batch.push({ source, hash: variant.hash, skill: active });
          batches.set(source.skillsDir, batch);
        }
      }
    } catch (error) {
      for (const source of skill.variants.flatMap((variant) => variant.sources)) {
        result.failures.push({
          clientId: source.clientId, skillName: skill.skillName,
          reason: error instanceof Error ? error.message : String(error), rolledBack: !(error instanceof AggregateError),
        });
      }
    }
  }
  const runId = uniqueTmpId();
  let number = 0;
  for (const batch of batches.values()) {
    const outcome = await reconcileLinkBatch(paths, runId, number++, batch, options.switchLinks ?? applyLinkSet);
    result.linksCreated += outcome.linksCreated;
    result.externalLinksAdopted += outcome.externalLinksAdopted;
    result.relinkedCount += outcome.linksCreated;
    result.failures.push(...outcome.failures);
  }
  if (options.pruneDangling && plan.danglingToPrune > 0) {
    const stale = new Set<string>();
    for (const entry of plan.scan.entries) {
      if (entry.kind !== "dangling-link" || !entry.registered) continue;
      const disk = await inspectClientPath(entry.entryPath);
      if (disk.kind === "missing" || disk.kind === "dead-link") stale.add(entry.registered.id);
    }
    if (stale.size > 0) {
      const ledger = await readLinksLedger(paths);
      const next = ledger.filter((entry) => !stale.has(entry.id));
      await writeLinksLedger(paths, next);
      result.danglingPruned = ledger.length - next.length;
    }
  }
  return result;
}
