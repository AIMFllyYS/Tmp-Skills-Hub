import { isStoreUnconfiguredError } from "@/lib/api-client";
import {
  fetchArchive,
  fetchBackups,
  fetchCatalog,
  fetchClientSkillStates,
  fetchClients,
  fetchDoctor,
  fetchGroups,
  fetchStats,
} from "./api.js";
import type {
  ArchivedSkill,
  BackupsListResponse,
  BackupsPreviewResponse,
  ClientSkillStatesResponse,
  ClientInfo,
  DoctorResponse,
  GroupDef,
  SkillRecord,
  StatsResponse,
} from "./types.js";

export type CatalogLoadState = "loading" | "ready" | "unconfigured" | "offline";

export type PrimaryCatalogResult =
  | { kind: "ready"; storeRoot: string; skills: SkillRecord[]; clients: ClientInfo[]; gitEnabled: boolean }
  | { kind: "unconfigured"; clients: ClientInfo[] };

export interface CatalogSnapshot {
  storeRoot: string;
  skills: SkillRecord[];
  clients: ClientInfo[];
  stats: StatsResponse;
  archived: ArchivedSkill[];
  doctor: DoctorResponse | null;
  backups: BackupsListResponse | null;
  groups: GroupDef[];
}

/** 首屏主门控:只等待核心技能列表与本机应用列表,区分未配置与离线。 */
export async function loadPrimaryCatalog(): Promise<PrimaryCatalogResult> {
  const [catalogResult, clientsResult] = await Promise.allSettled([fetchCatalog(), fetchClients()]);
  const clients = clientsResult.status === "fulfilled" ? clientsResult.value : [];
  if (catalogResult.status === "fulfilled") {
    return {
      kind: "ready",
      storeRoot: catalogResult.value.storeRoot,
      skills: catalogResult.value.skills,
      gitEnabled: catalogResult.value.gitEnabled,
      clients,
    };
  }
  if (isStoreUnconfiguredError(catalogResult.reason)) {
    return { kind: "unconfigured", clients };
  }
  throw catalogResult.reason;
}

/** 整包拉取(保留用于向后兼容与单次快照场景)。doctor、备份失败不拖垮目录。 */
export async function loadCatalogSnapshot(): Promise<CatalogSnapshot> {
  const [catalog, clients, stats, archived, doctor, backups, groups] = await Promise.all([
    fetchCatalog(),
    fetchClients(),
    fetchStats(),
    fetchArchive(),
    fetchDoctor().catch(() => null),
    fetchBackups().catch(() => null),
    fetchGroups().catch(() => []),
  ]);
  return {
    storeRoot: catalog.storeRoot,
    skills: catalog.skills,
    clients,
    stats,
    archived,
    doctor,
    backups,
    groups,
  };
}

/** 收录 / 分组 / 批量挂链后的轻量刷新。 */
export async function loadCatalogRefresh(selectedClientId: string | null): Promise<{
  storeRoot: string;
  skills: SkillRecord[];
  groups: GroupDef[];
  gitEnabled: boolean;
  clientStates: ClientSkillStatesResponse | null;
}> {
  const [catalog, clientStates, groups] = await Promise.all([
    fetchCatalog(),
    selectedClientId === null ? Promise.resolve(null) : fetchClientSkillStates(selectedClientId),
    fetchGroups().catch(() => []),
  ]);
  return { storeRoot: catalog.storeRoot, skills: catalog.skills, gitEnabled: catalog.gitEnabled, groups, clientStates };
}

export function patchSkillVisibility(
  skills: readonly SkillRecord[],
  hash: string,
  clientId: string,
  enable: boolean,
): SkillRecord[] {
  return skills.map((s) => {
    if (s.hash !== hash) return s;
    const visible = enable
      ? (s.visibleIn.includes(clientId) ? s.visibleIn : [...s.visibleIn, clientId])
      : s.visibleIn.filter((id) => id !== clientId);
    return { ...s, visibleIn: visible };
  });
}

export function patchClientStates(
  prev: ClientSkillStatesResponse | null,
  hash: string,
  clientId: string,
  enable: boolean,
): ClientSkillStatesResponse | null {
  if (prev === null || prev.clientId !== clientId) return prev;
  const rows = prev.rows.map((r) =>
    r.hash === hash
      ? { ...r, state: enable ? "managed" as const : "off" as const, detail: enable ? "已启用" : "未启用" }
      : r,
  );
  return { ...prev, rows, enabled: rows.filter((r) => r.state === "managed").length };
}

export function renameSkillHash(
  skills: readonly SkillRecord[],
  oldHash: string,
  newHash: string,
): SkillRecord[] {
  return skills.map((s) => (s.hash === oldHash ? { ...s, hash: newHash } : s));
}

/** 把重置预览收成确认文案。不展示 aside 路径:预览里的旁路名是占位,与实写不一致。 */
export function formatResetPreview(preview: BackupsPreviewResponse): string {
  return (
    "将按快照 " + preview.snapshotId +
    " 还原 " + String(preview.clients) + " 个应用、" +
    String(preview.skills) + " 项技能（" +
    String(preview.files) + " 文件 / " + String(preview.links) + " 链接）。" +
    "旧库存会旁路后再自动收录。此操作不能用撤销按钮收回。"
  );
}
