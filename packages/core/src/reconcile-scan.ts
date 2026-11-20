import type { Dirent } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { discoverClientRoots, type ClientRoot } from "./clients.js";
import { inspectSkillFingerprint, type SkillFingerprint } from "./hash.js";
import { readLinkTarget } from "./link-probe.js";
import { readLinksLedger, type LinkEntry } from "./links.js";
import { isIgnoredSkillEntry } from "./skill-ignore.js";
import { readSkillMeta } from "./skill-md.js";
import { isPortableSkillName } from "./skill-name.js";
import type { HubPaths } from "./store-location.js";
import { readStoreIndex } from "./store.js";
import type { SkillMeta, SkillRecord } from "./types.js";

export type DriftEntryKind =
  | "managed-link"
  | "unmanaged-real-dir"
  | "replaced-link-real-dir"
  | "external-symlink"
  | "dangling-link"
  | "non-skill-entry";

export interface DriftEntry extends ClientRoot {
  entryName: string;
  entryPath: string;
  kind: DriftEntryKind;
  target?: string;
  registered?: LinkEntry;
  reason?: "system-dir" | "non-skill-file" | "ignored";
}

export interface DriftL1Report {
  roots: ClientRoot[];
  entries: DriftEntry[];
  counts: Record<DriftEntryKind, number>;
  scannedAt: string;
  scanDurationMs: number;
}

export interface DriftVariant extends SkillFingerprint {
  sourceClients: string[];
  sources: DriftEntry[];
  sourcePath: string;
  inStore: boolean;
}

export interface DriftSkill {
  skillName: string;
  kind: "identical-to-store" | "new-skill" | "name-conflict";
  storeSkill: SkillRecord | null;
  variants: DriftVariant[];
  shorterContentWarning: boolean;
}

export interface DriftL2Report {
  skills: DriftSkill[];
  incomplete: DriftIncomplete[];
  skippedExternalLinks: DriftEntry[];
}

export interface DriftIncomplete extends DriftEntry {
  status: "incomplete-or-non-skill";
  storeUnavailable?: true;
}

const key = (file: string) => process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);

function contains(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

async function classify(
  root: ClientRoot,
  item: Dirent,
  ledger: ReadonlyMap<string, LinkEntry>,
  skillsRoot: string,
  resolveTarget: (target: string) => Promise<string | null>,
): Promise<DriftEntry> {
  const entryName = item.name;
  const entryPath = path.join(root.skillsDir, entryName);
  const registered = ledger.get(key(entryPath));
  const entry = { ...root, entryName, entryPath, ...(registered && { registered }) };
  if (entryName === ".system" || entryName === "builtin_skills") return { ...entry, kind: "non-skill-entry", reason: "system-dir" };
  if (isIgnoredSkillEntry(entryName)) return { ...entry, kind: "non-skill-entry", reason: "ignored" };
  if (item.isSymbolicLink() || (process.platform === "win32" && item.isDirectory())) {
    const target = await readLinkTarget(entryPath);
    if (target !== null) {
      const real = await resolveTarget(target);
      if (real === null) return { ...entry, kind: "dangling-link", target };
      if (!contains(skillsRoot, real)) return { ...entry, kind: "external-symlink", target };
      return registered
        ? { ...entry, kind: "managed-link", target }
        : { ...entry, kind: "non-skill-entry", target, reason: "ignored" };
    }
  }
  if (item.isDirectory()) return { ...entry, kind: registered ? "replaced-link-real-dir" : "unmanaged-real-dir" };
  return { ...entry, kind: "non-skill-entry", reason: "non-skill-file" };
}

/** 仅访问目录和链接元数据。L1 可用于启动巡检。 */
export async function scanClientDriftL1(home: string, paths: HubPaths): Promise<DriftL1Report> {
  const start = performance.now();
  const [roots, ledger, skillsRoot] = await Promise.all([
    discoverClientRoots(home, { storeRoot: paths }),
    readLinksLedger(paths),
    realpath(paths.skillsRoot).catch(() => path.resolve(paths.skillsRoot)),
  ]);
  const registered = new Map(ledger.filter((e) => isPortableSkillName(e.entryName)).map((entry) => [
    key(path.join(entry.targetDir, entry.entryName)), entry,
  ]));
  const resolvedTargets = new Map<string, Promise<string | null>>();
  const resolveTarget = (target: string): Promise<string | null> => {
    const normalized = key(target);
    const previous = resolvedTargets.get(normalized);
    if (previous) return previous;
    const current = realpath(target).catch(() => null);
    resolvedTargets.set(normalized, current);
    return current;
  };
  const discovered = await Promise.all(roots.map(async (root) => {
    const items = await readdir(root.skillsDir, { withFileTypes: true }).catch(() => []);
    return Promise.all(items.map((item) => classify(root, item, registered, skillsRoot, resolveTarget)));
  }));
  const entries = discovered.flat();
  const found = new Set(entries.map((entry) => key(entry.entryPath)));
  const rootKeys = new Set(roots.map((root) => key(root.skillsDir)));
  const missing = await Promise.all([...registered.entries()].filter(([file, entry]) =>
    !found.has(file) && (rootKeys.has(key(entry.targetDir)) || (entry.scope !== "project" && contains(home, entry.targetDir))),
  ).map(async ([, entry]): Promise<DriftEntry | null> => {
    const entryPath = path.join(entry.targetDir, entry.entryName);
    const exists = await lstat(entryPath).then(() => true, (error: NodeJS.ErrnoException) => error.code !== "ENOENT");
    return exists ? null : {
      kind: "dangling-link", entryPath, entryName: entry.entryName,
      skillsDir: entry.targetDir, clientId: entry.clientId, registered: entry,
    };
  }));
  for (const entry of missing) if (entry !== null) entries.push(entry);
  entries.sort((a, b) => a.entryPath.localeCompare(b.entryPath));
  const counts: DriftL1Report["counts"] = {
    "managed-link": 0, "unmanaged-real-dir": 0, "replaced-link-real-dir": 0,
    "external-symlink": 0, "dangling-link": 0, "non-skill-entry": 0,
  };
  for (const entry of entries) counts[entry.kind]++;
  return { roots, entries, counts, scannedAt: new Date().toISOString(), scanDurationMs: performance.now() - start };
}

async function inspectCandidate(entry: DriftEntry): Promise<{ entry: DriftEntry; meta: SkillMeta; fingerprint: SkillFingerprint } | null> {
  const disk = await lstat(entry.entryPath).catch(() => null);
  const valid = entry.kind === "external-symlink"
    ? disk !== null && await readLinkTarget(entry.entryPath) === entry.target
    : disk?.isDirectory() && !disk.isSymbolicLink();
  if (!valid) return null;
  const manifest = await lstat(path.join(entry.entryPath, "SKILL.md")).catch(() => null);
  if (!manifest?.isFile()) return null;
  const meta = await readSkillMeta(entry.entryPath);
  if (meta === null || !isPortableSkillName(meta.name) || !isPortableSkillName(entry.entryName) || meta.description.trim() === "") return null;
  const fingerprint = await inspectSkillFingerprint(entry.entryPath).catch(() => null);
  return fingerprint === null ? null : { entry, meta, fingerprint };
}

function addVariant(variants: Map<string, DriftVariant>, variant: DriftVariant): void {
  const previous = variants.get(variant.hash);
  if (!previous) {
    variants.set(variant.hash, variant);
    return;
  }
  previous.sourceClients = [...new Set([...previous.sourceClients, ...variant.sourceClients])].sort();
  previous.sources.push(...variant.sources);
  previous.inStore ||= variant.inStore;
  if (variant.maxMtimeMs > previous.maxMtimeMs) {
    previous.maxMtimeMs = variant.maxMtimeMs;
    previous.sourcePath = variant.sourcePath;
  }
}

/** 仅对可接管异常计算内容指纹，并对撞名的活跃副本做同一套检查。 */
export async function inspectDriftL2(
  l1Report: DriftL1Report,
  paths: HubPaths,
  options?: { includeExternalLinks?: boolean },
): Promise<DriftL2Report> {
  const candidates = l1Report.entries.filter((entry) =>
    entry.kind === "unmanaged-real-dir" || entry.kind === "replaced-link-real-dir" ||
    (entry.kind === "external-symlink" && options?.includeExternalLinks === true),
  );
  const skippedExternalLinks = options?.includeExternalLinks === true ? [] : l1Report.entries.filter((entry) => entry.kind === "external-symlink");
  const incomplete: DriftIncomplete[] = [];
  const byName = new Map<string, { name: string; variants: Map<string, DriftVariant> }>();
  for (const entry of candidates) {
    const scanned = await inspectCandidate(entry);
    if (scanned === null) {
      incomplete.push({ ...entry, status: "incomplete-or-non-skill" });
      continue;
    }
    const identity = scanned.meta.name.toLowerCase();
    const group = byName.get(identity) ?? { name: scanned.meta.name, variants: new Map<string, DriftVariant>() };
    addVariant(group.variants, { ...scanned.fingerprint, sourceClients: [entry.clientId], sources: [entry], sourcePath: entry.entryPath, inStore: false });
    byName.set(identity, group);
  }
  const index = await readStoreIndex(paths);
  const skills: DriftSkill[] = [];
  for (const [identity, { name, variants }] of byName) {
    const storeSkill = index.find((skill) => skill.dirName.toLowerCase() === identity) ?? null;
    if (storeSkill !== null) {
      const sourcePath = path.join(paths.skillsRoot, storeSkill.dirName);
      const existing = isPortableSkillName(storeSkill.dirName)
        ? await inspectSkillFingerprint(sourcePath).catch(() => null)
        : null;
      if (existing === null) {
        for (const variant of variants.values()) {
          incomplete.push(...variant.sources.map((entry) => ({
            ...entry, status: "incomplete-or-non-skill" as const, storeUnavailable: true as const,
          })));
        }
        continue;
      }
      addVariant(variants, { ...existing, sourceClients: ["store"], sources: [], sourcePath, inStore: true });
    }
    const sorted = [...variants.values()].sort((a, b) => b.maxMtimeMs - a.maxMtimeMs || a.hash.localeCompare(b.hash));
    const newest = sorted[0]!;
    const shorterContentWarning = sorted.slice(1).some((variant) =>
      newest.totalBytes < variant.totalBytes * 0.65 || (newest.maxMtimeMs - variant.maxMtimeMs) < 10_000,
    );
    skills.push({
      skillName: storeSkill?.dirName ?? name,
      kind: sorted.length > 1 ? "name-conflict" : storeSkill === null ? "new-skill" : "identical-to-store",
      storeSkill, variants: sorted, shorterContentWarning,
    });
  }
  skills.sort((a, b) => a.skillName.localeCompare(b.skillName));
  return { skills, incomplete, skippedExternalLinks };
}
