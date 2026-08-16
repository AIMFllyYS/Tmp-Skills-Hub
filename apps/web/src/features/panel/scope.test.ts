import { describe, expect, it } from "vitest";
import { buildScopeCounts, isSkillScope, sameScope, skillsForScope, type ScopeSelection } from "./scope.js";
import type { ClientInfo, GroupDef, SkillRecord } from "../skills/types.js";

function skill(partial: Partial<SkillRecord> & Pick<SkillRecord, "hash" | "dirName">): SkillRecord {
  return {
    meta: { name: partial.dirName, description: "d" },
    origins: [{ kind: "local", reference: partial.dirName }],
    visibleIn: [],
    installedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

const skills: SkillRecord[] = [
  skill({ hash: "a", dirName: "alpha", visibleIn: ["claude"], origins: [{ kind: "github", reference: "x" }] }),
  skill({ hash: "b", dirName: "beta", visibleIn: ["claude", "cursor"], origins: [{ kind: "local", reference: "y" }] }),
  skill({ hash: "c", dirName: "gamma", visibleIn: [], origins: [{ kind: "local", reference: "z" }] }),
];

const groups: GroupDef[] = [
  { id: "dev", name: "开发", description: "", memberHashes: ["a", "b", "missing"] },
];

const clients: ClientInfo[] = [
  { clientId: "claude", skillsDir: "/c" },
  { clientId: "cursor", skillsDir: "/u" },
];

describe("skillsForScope", () => {
  it("全部技能返回全集", () => {
    expect(skillsForScope(skills, groups, { kind: "all" }).map((s) => s.hash)).toEqual(["a", "b", "c"]);
  });

  it("分组只含仍在库存里的成员", () => {
    expect(skillsForScope(skills, groups, { kind: "group", id: "dev" }).map((s) => s.hash)).toEqual(["a", "b"]);
  });

  it("客户端视角返回全集,由行级状态区分启停", () => {
    expect(skillsForScope(skills, groups, { kind: "client", id: "cursor" }).map((s) => s.hash)).toEqual(["a", "b", "c"]);
  });

  it("来源按 origin.kind 切", () => {
    expect(skillsForScope(skills, groups, { kind: "source", id: "github" }).map((s) => s.hash)).toEqual(["a"]);
  });

  it("归档与报告不走 skill 列表", () => {
    expect(skillsForScope(skills, groups, { kind: "archive" })).toEqual([]);
    expect(skillsForScope(skills, groups, { kind: "report" })).toEqual([]);
  });
});

describe("buildScopeCounts", () => {
  it("计数与切片一致,分组不计失踪成员", () => {
    const c = buildScopeCounts(skills, groups, clients, [{ file: "z", name: "old", sizeBytes: 1, archivedAt: "t" }]);
    expect(c.all).toBe(3);
    expect(c.groups).toEqual([{ id: "dev", name: "开发", count: 2 }]);
    expect(c.clients).toEqual([
      { id: "claude", count: 2 },
      { id: "cursor", count: 1 },
    ]);
    expect(c.sources).toEqual([
      { id: "github", count: 1 },
      { id: "local", count: 2 },
    ]);
    expect(c.archive).toBe(1);
  });
});

describe("scope helpers", () => {
  const all: ScopeSelection = { kind: "all" };
  it("sameScope / isSkillScope", () => {
    expect(sameScope(all, { kind: "all" })).toBe(true);
    expect(sameScope({ kind: "group", id: "dev" }, { kind: "group", id: "dev" })).toBe(true);
    expect(sameScope({ kind: "group", id: "dev" }, { kind: "group", id: "other" })).toBe(false);
    expect(isSkillScope(all)).toBe(true);
    expect(isSkillScope({ kind: "archive" })).toBe(false);
  });
});
