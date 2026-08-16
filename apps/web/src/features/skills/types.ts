/** 契约类型:与 docs/specs/http-api-v0.md、json-contract-v0.md 的字段定义一致。 */

export interface SkillOrigin {
  kind: string;
  reference: string;
}

export interface SkillRecord {
  hash: string;
  dirName: string;
  meta: { name: string; description: string };
  /** 收录来源(与 visibleIn 永不合并) */
  origins: SkillOrigin[];
  /** 在哪些客户端可见(台账实时推导) */
  visibleIn: string[];
  installedAt: string;
}

export interface GroupDef {
  id: string;
  name: string;
  description: string;
  memberHashes: string[];
}

export interface SkillsResponse {
  ok: true;
  command: "skills";
  storeRoot: string;
  total: number;
  skills: SkillRecord[];
}

export interface GroupsResponse {
  ok: true;
  command: "groups";
  version: number;
  groups: GroupDef[];
}

export interface ClientInfo {
  clientId: string;
  skillsDir: string;
}

export type ClientLinkState = "managed" | "off" | "unregistered-conflict" | "dangling";

export interface ClientLinkRow {
  clientId: string;
  state: ClientLinkState;
  detail: string;
}

export interface SkillLinksResponse {
  ok: true;
  command: "skill-links";
  hash: string;
  links: ClientLinkRow[];
}

export interface ClientSkillStateRow {
  hash: string;
  state: ClientLinkState;
  detail: string;
}

export interface ClientSkillStatesResponse {
  ok: true;
  command: "client-skill-states";
  clientId: string;
  skillsDir: string;
  enabled: number;
  total: number;
  rows: ClientSkillStateRow[];
}

export interface ClientsResponse {
  ok: true;
  command: "clients";
  clients: ClientInfo[];
}

export interface UsageCounters {
  show: number;
  enable: number;
}

export interface StatsResponse {
  ok: true;
  command: "stats";
  stats: { version: number; counters: Record<string, UsageCounters> };
  ranking: { hash: string; total: number; show: number; enable: number }[];
}

export interface ArchivedSkill {
  file: string;
  name: string;
  sizeBytes: number;
  archivedAt: string;
}

export interface ArchiveResponse {
  ok: true;
  command: "archive";
  verb: "list";
  archiveDir: string;
  archived: ArchivedSkill[];
}

export interface SkillFileEntry {
  path: string;
  kind: "file" | "dir";
  sizeBytes: number;
}

export interface SkillTreeResponse {
  ok: true;
  command: "skill-tree";
  dirName: string;
  entries: SkillFileEntry[];
  truncated: boolean;
}

export interface SkillFileResponse {
  ok: true;
  command: "skill-file";
  dirName: string;
  path: string;
  content: string;
  sizeBytes: number;
}

export interface ApiError {
  ok: false;
  command: string;
  code: string;
  message: string;
}

export interface LinksBatchParams {
  hashes: string[];
  clientIds: string[];
  action: "enable" | "disable";
}

export interface LinkDiffItem {
  hash: string;
  dirName: string;
  clientId: string;
  dest: string;
}

export interface LinkConflictItem extends LinkDiffItem {
  at: string;
  reason: string;
  code: string;
}

export interface LinksPreviewResponse {
  ok: true;
  command: "links-preview";
  action: "enable" | "disable";
  add: number;
  remove: number;
  conflictCount: number;
  wouldCreate: LinkDiffItem[];
  wouldRemove: LinkDiffItem[];
  conflicts: LinkConflictItem[];
}

export interface LinksApplyResponse {
  ok: true;
  command: "links-apply";
  action: "enable" | "disable";
  created: string[];
  removed: string[];
}

export interface AdoptOutcome {
  kind: string;
  folder: string;
  hash?: string | undefined;
  existingHash?: string | undefined;
  incomingHash?: string | undefined;
  reason?: string | undefined;
}

export interface AnalyzeReportItem {
  name: string;
  reason: string;
}

export interface AnalyzeResponse {
  ok: true;
  command: "analyze";
  target: string;
  similar: AnalyzeReportItem[];
  conflict: AnalyzeReportItem[];
}

export interface AdoptResponse {
  ok: true;
  command: "adopt";
  adopted: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
  outcomes: AdoptOutcome[];
}
