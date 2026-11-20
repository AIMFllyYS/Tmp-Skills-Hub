import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverClientRoots,
  findDanglingLinks,
  probeLinkTypes,
  readLinksLedger,
  readStoreIndex,
  resolveHubPaths,
  normalizeHubPaths,
  writeLinksLedger,
  type DanglingLink,
  type LinkEntry,
  type LinkTypeProbe,
  type StoreRootOptions,
  type HubPaths,
} from "@skills-hub/core";
import { resolveConfiguredHubPaths } from "./store-shared.js";

export interface DoctorStoreInfo {
  resolved: boolean;
  storeRoot: string | null;
  reachable: boolean;
  error: string | null;
}

export interface DoctorReport {
  store: DoctorStoreInfo;
  roots: { clientId: string; skillsDir: string }[];
  linkTypes: LinkTypeProbe;
  danglingLinks: DanglingLink[];
}

async function probeStore(storeRoot: HubPaths): Promise<{ reachable: boolean; error: string | null }> {
  try {
    await readStoreIndex(storeRoot);
    return { reachable: true, error: null };
  } catch (e) {
    return { reachable: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 环境自检。只读:不改库存、不修链接。 */
export async function collectDoctorReport(
  home: string,
  injectedStoreRoot?: string | HubPaths | null,
  storeOpts?: StoreRootOptions,
): Promise<DoctorReport> {
  const resolved = injectedStoreRoot === undefined
    ? await (storeOpts ? resolveHubPaths(storeOpts) : resolveConfiguredHubPaths(home))
    : null;
  const paths = resolved?.ok ? resolved.paths : injectedStoreRoot ? normalizeHubPaths(injectedStoreRoot) : null;
  const store: DoctorStoreInfo = paths === null
    ? { resolved: false, storeRoot: null, reachable: false, error: resolved && !resolved.ok ? resolved.message : "库存未配置" }
    : { resolved: true, storeRoot: paths.stateRoot, ...await probeStore(paths) };
  const roots = await discoverClientRoots(home, paths === null ? undefined : { storeRoot: paths });
  const probeDir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-linkprobe-"));
  const linkTypes = await probeLinkTypes(probeDir);
  await rm(probeDir, { recursive: true, force: true });
  let ledger: LinkEntry[] = [];
  if (store.reachable && paths !== null) {
    ledger = await readLinksLedger(paths).catch(() => []);
  }
  const danglingLinks = await findDanglingLinks(
    roots.map((r) => r.skillsDir),
    ledger,
  );
  return { store, roots: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })), linkTypes, danglingLinks };
}

export async function performPrune(paths: HubPaths, dryRun: boolean) {
  const ledger = await readLinksLedger(paths);
  const dangling = await findDanglingLinks([], ledger);
  const pathsToPrune = new Set(dangling.map((entry) => path.resolve(entry.linkPath)));
  const pruned = ledger.filter((entry) => pathsToPrune.has(path.resolve(entry.targetDir, entry.entryName)));
  const ids = new Set(pruned.map((entry) => entry.id));
  if (!dryRun && ids.size > 0) await writeLinksLedger(paths, ledger.filter((entry) => !ids.has(entry.id)));
  return { dryRun, count: pruned.length, pruned };
}
