import type { ArchivedSkill, ClientInfo, GroupDef, SkillRecord } from "../skills/types.js";

export type ScopeKind = "all" | "group" | "client" | "source" | "archive" | "report";

export interface ScopeSelection {
  kind: ScopeKind;
  /** group id / clientId / 来源 kind */
  id?: string;
}

export interface ScopeGroupCount {
  id: string;
  name: string;
  count: number;
}

export interface ScopeNamedCount {
  id: string;
  count: number;
}

export interface ScopeCounts {
  all: number;
  groups: ScopeGroupCount[];
  clients: ScopeNamedCount[];
  sources: ScopeNamedCount[];
  archive: number;
}

export function scopeKey(scope: ScopeSelection): string {
  return scope.id !== undefined && scope.id !== "" ? scope.kind + ":" + scope.id : scope.kind;
}

export function sameScope(a: ScopeSelection, b: ScopeSelection): boolean {
  return scopeKey(a) === scopeKey(b);
}

/** 作用域是否展示 skill 集合(归档/报告走各自面板)。 */
export function isSkillScope(scope: ScopeSelection): boolean {
  return scope.kind === "all" || scope.kind === "group" || scope.kind === "client" || scope.kind === "source";
}

/** 按作用域切片库存。归档/报告返回空(集合列另渲染)。 */
export function skillsForScope(skills: SkillRecord[], groups: GroupDef[], scope: ScopeSelection): SkillRecord[] {
  switch (scope.kind) {
    case "group": {
      const g = groups.find((x) => x.id === scope.id);
      if (g === undefined) return [];
      const members = new Set(g.memberHashes);
      return skills.filter((s) => members.has(s.hash));
    }
    case "client":
      // 客户端视角看全集,行上再标这一份客户端的状态(#106)
      return skills;
    case "source":
      return skills.filter((s) => s.origins.some((o) => o.kind === scope.id));
    case "archive":
    case "report":
      return [];
    default:
      return skills;
  }
}

export function buildScopeCounts(
  skills: SkillRecord[],
  groups: GroupDef[],
  clients: ClientInfo[],
  archived: readonly ArchivedSkill[],
): ScopeCounts {
  const live = new Set(skills.map((s) => s.hash));
  const sourceMap = new Map<string, number>();
  for (const s of skills) {
    for (const o of s.origins) {
      sourceMap.set(o.kind, (sourceMap.get(o.kind) ?? 0) + 1);
    }
  }
  return {
    all: skills.length,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      count: g.memberHashes.filter((h) => live.has(h)).length,
    })),
    clients: clients.map((c) => ({
      id: c.clientId,
      count: skills.filter((s) => s.visibleIn.includes(c.clientId)).length,
    })),
    sources: [...sourceMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, count]) => ({ id, count })),
    archive: archived.length,
  };
}
