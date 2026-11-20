import { apiRequest } from "@/lib/api-client";

interface HubPathsResponse {
  stateRoot: string;
  skillsRoot: string;
  layoutMode: "legacy" | "split";
}

export interface StoreSettings extends HubPathsResponse {
  ok: true;
  stateDiskBytes: number;
  git: { enabled: boolean; remoteUrl?: string; branch?: string };
  autoLaunch: boolean;
  silentTray: boolean;
  isDesktop: boolean;
}

export interface StoreMigration {
  ok: true;
  dryRun: boolean;
  paths: HubPathsResponse;
  skills: number;
  movedLinks: number;
  aside: string | null;
}

interface PruneResult {
  ok: true;
  count: number;
}

interface AcceptResult {
  ok: true;
  count: number;
  missing: { name: string }[];
}

export function fetchStoreSettings(signal?: AbortSignal): Promise<StoreSettings> {
  return apiRequest<StoreSettings>("/api/settings", signal === undefined ? {} : { signal });
}

export function patchStoreSettings(body: { autoLaunch?: boolean; silentTray?: boolean }): Promise<StoreSettings> {
  return apiRequest<StoreSettings>("/api/settings", { method: "PATCH", body });
}

export function migrateStore(targetSkillsRoot: string, dryRun = false): Promise<StoreMigration> {
  return apiRequest<StoreMigration>("/api/store/migrate", { method: "POST", body: { targetSkillsRoot, dryRun } });
}

export function pruneDangling(dryRun = false, signal?: AbortSignal): Promise<PruneResult> {
  return apiRequest<PruneResult>("/api/doctor/prune", {
    method: "POST", body: { dryRun }, ...(signal === undefined ? {} : { signal }),
  });
}

export function acceptDrifted(names: readonly string[]): Promise<AcceptResult> {
  return apiRequest<AcceptResult>("/api/verify/accept", { method: "POST", body: { names } });
}

export async function loadStoreHealth(signal: AbortSignal): Promise<{ danglingCount: number; driftedSkills: string[] }> {
  const [prune, verify] = await Promise.all([
    pruneDangling(true, signal),
    apiRequest<{ ok: true; drifted: { name: string }[] }>("/api/verify", { signal }),
  ]);
  return { danglingCount: prune.count, driftedSkills: verify.drifted.map((skill) => skill.name) };
}
