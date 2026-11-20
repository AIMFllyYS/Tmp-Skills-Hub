import {
  executeReconcile,
  planReconcile,
  scanClientDriftL1,
  type DriftL1Report,
  type DriftSkill,
  type HubPaths,
  type ReconcilePlan,
} from "@skills-hub/core";
import { autoVersionSkillAssets } from "./git-ops.js";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { scrub } from "./llm/errors.js";
import { requireWriteAuth, resolveConfiguredHubPaths, resolveStoreRootOrFail } from "./store-shared.js";

export function reconcileSummary(scan: DriftL1Report, newConflicts = 0) {
  return {
    clientsScanned: scan.roots.length,
    managedLinks: scan.counts["managed-link"],
    unmanagedRealDirs: scan.counts["unmanaged-real-dir"],
    replacedLinks: scan.counts["replaced-link-real-dir"],
    externalSymlinks: scan.counts["external-symlink"],
    danglingLinks: scan.counts["dangling-link"],
    nonSkillEntries: scan.counts["non-skill-entry"],
    newConflicts,
    scanDurationMs: scan.scanDurationMs,
    scannedAt: scan.scannedAt,
  };
}

/** Desktop startup can inspect links without hashing any skills or starting the HTTP server. */
export async function performReconcileScanL1(home = resolveHome(), injectedPaths?: HubPaths) {
  const configured = injectedPaths === undefined ? await resolveConfiguredHubPaths(home) : null;
  const paths = injectedPaths ?? (configured?.ok ? configured.paths : null);
  if (paths === null) return null;
  return reconcileSummary(await scanClientDriftL1(home, paths));
}

function previewSkill(skill: DriftSkill, action: "adopt" | "relink-identical") {
  const variant = skill.variants[0]!;
  return {
    skillName: skill.skillName, action,
    sourceClients: [...new Set(variant.sources.map((entry) => entry.clientId))].sort(),
    replacesBrokenLink: variant.sources.some((entry) => entry.kind === "replaced-link-real-dir"),
    hash: variant.hash, fileCount: variant.fileCount, totalBytes: variant.totalBytes, maxMtimeMs: variant.maxMtimeMs,
  };
}

export function reconcilePreview(plan: ReconcilePlan) {
  return {
    backupRequired: plan.backupRequired, backupDir: plan.backupDir, skillsRoot: plan.skillsRoot,
    toAdopt: plan.toAdopt.map((skill) => previewSkill(skill, "adopt")),
    toRelinkIdentical: plan.toRelinkIdentical.map((skill) => previewSkill(skill, "relink-identical")),
    conflicts: plan.conflicts.map((skill) => {
      const winner = skill.variants[0]!;
      return {
        skillName: skill.skillName,
        provisionalWinnerClient: winner.sources.find((entry) => entry.entryPath === winner.sourcePath)?.clientId ?? winner.sourceClients[0]!,
        provisionalWinnerVariantId: winner.hash.slice(0, 12),
        maxMtimeMs: winner.maxMtimeMs, variantCount: skill.variants.length,
        shorterContentWarning: skill.shorterContentWarning,
        involvedClients: [...new Set(skill.variants.flatMap((variant) => variant.sourceClients))].sort(),
        variants: skill.variants.map((variant, index) => ({
          variantId: variant.hash.slice(0, 12), hash: variant.hash, sourceClients: variant.sourceClients,
          maxMtimeMs: variant.maxMtimeMs, fileCount: variant.fileCount, totalBytes: variant.totalBytes, isProvisionalWinner: index === 0,
        })),
      };
    }),
    skippedExternalLinks: plan.skippedExternalLinks.map((entry) => ({
      skillName: entry.entryName, clientId: entry.clientId, linkPath: entry.entryPath, targetPath: entry.target ?? "",
    })),
    untouchedNonSkill: plan.untouchedNonSkill.map((entry) => ({
      name: entry.entryName, clientId: entry.clientId, path: entry.entryPath, reason: entry.reason ?? "incomplete-skill",
    })),
    danglingToPrune: plan.danglingToPrune,
  };
}

export async function performReconcile(home: string, paths: HubPaths, includeExternalLinks: boolean) {
  const outcome = await executeReconcile(home, paths, { includeExternalLinks, pruneDangling: true });
  if (!outcome.ok) return { ...outcome, message: scrub(outcome.message) };
  if (outcome.adoptedCount > 0 || outcome.conflictCount > 0) {
    await autoVersionSkillAssets(home, paths, "chore(skills): reconcile client versions");
  }
  return { ...outcome, failures: outcome.failures.map((failure) => ({ ...failure, reason: scrub(failure.reason) })) };
}

export async function runReconcile(args: {
  home: string | undefined;
  yes: boolean | undefined;
  json: boolean | undefined;
  dryRun: boolean;
  includeExternalLinks: boolean;
}): Promise<void> {
  if (!args.dryRun && !requireWriteAuth(args, "reconcile")) return;
  const paths = await resolveStoreRootOrFail(args, "reconcile");
  if (paths === null) return;
  const home = resolveHome(args.home);
  try {
    if (args.dryRun) {
      const plan = await planReconcile(home, paths, { includeExternalLinks: args.includeExternalLinks });
      const result = reconcilePreview(plan);
      if (args.json) emitOk("reconcile", { dryRun: true, summary: reconcileSummary(plan.scan, result.conflicts.length), ...result });
      else console.log(`将备份并接管：新增 ${result.toAdopt.length}，同指纹 ${result.toRelinkIdentical.length}，冲突 ${result.conflicts.length}，跳过外链 ${result.skippedExternalLinks.length}。`);
      return;
    }
    const result = await performReconcile(home, paths, args.includeExternalLinks);
    if (!result.ok) {
      emitError(args.json === true, "reconcile", result.code, result.message);
      return;
    }
    if (args.json) emitOk("reconcile", { ...result, dryRun: false });
    else {
      console.log(`备份 ${result.snapshotId} 已校验，新增 ${result.adoptedCount}，冲突 ${result.conflictCount}，建链 ${result.linksCreated}。`);
      for (const failure of result.failures) console.error(`[${failure.clientId}] ${failure.skillName} ${failure.reason}`);
    }
    if (result.failures.length > 0) process.exitCode = 1;
  } catch (error) {
    emitError(args.json === true, "reconcile", "io-error", scrub(error instanceof Error ? error.message : String(error)));
  }
}
