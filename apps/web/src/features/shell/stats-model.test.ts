import { describe, expect, it } from "vitest";
import type { ClientInfo, SkillRecord } from "../skills/types.js";
import { appDistribution, coverageOf, sourceDistribution, usageRows } from "./stats-model.js";

function skill(name: string, visibleIn: string[], origins: string[] = []): SkillRecord {
  return {
    hash: name.padEnd(64, "0"),
    dirName: name,
    meta: { name, description: name },
    origins: origins.map((kind) => ({ kind, reference: name })),
    visibleIn,
    installedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("stats-model", () => {
  it("coverageOf 只计至少挂到一个应用的 skill", () => {
    const skills = [skill("a", ["claude"]), skill("b", []), skill("c", ["cursor", "claude"])];
    expect(coverageOf(skills)).toEqual({ linked: 2, total: 3 });
  });

  it("appDistribution 按客户端计启用数", () => {
    const skills = [skill("a", ["claude"]), skill("b", ["claude", "cursor"])];
    const clients: ClientInfo[] = [
      { clientId: "claude", skillsDir: "/c" },
      { clientId: "cursor", skillsDir: "/u" },
    ];
    expect(appDistribution(skills, clients)).toEqual([
      { id: "claude", enabled: 2, total: 2 },
      { id: "cursor", enabled: 1, total: 2 },
    ]);
  });

  it("sourceDistribution 按来源种类计数", () => {
    const skills = [skill("a", [], ["local"]), skill("b", [], ["github"]), skill("c", [], ["local"])];
    expect(sourceDistribution(skills)).toEqual([
      { kind: "local", count: 2 },
      { kind: "github", count: 1 },
    ]);
  });

  it("usageRows 优先用 ranking", () => {
    const skills = [skill("alpha", [])];
    const rows = usageRows(skills, [{ hash: skills[0]!.hash, total: 9, show: 4, enable: 5 }], new Map());
    expect(rows[0]).toEqual({ name: "alpha", total: 9, show: 4, enable: 5 });
  });
});
