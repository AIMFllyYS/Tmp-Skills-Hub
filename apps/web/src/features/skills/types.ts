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

export interface ApiError {
  ok: false;
  command: string;
  code: string;
  message: string;
}
