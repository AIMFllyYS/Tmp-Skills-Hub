import { describe, expect, it } from "vitest";
import type { SkillRecord } from "../skills/types.js";
import { fallbackClientState, filterByClientEnable } from "./client-view.js";

function skill(hash: string, dirName: string): SkillRecord {
  return {
    hash,
    dirName,
    meta: { name: dirName, description: "d" },
    origins: [{ kind: "local", reference: dirName }],
    visibleIn: [],
    installedAt: "2026-01-01T00:00:00.000Z",
  };
}

const skills = [skill("a", "alpha"), skill("b", "beta"), skill("c", "gamma")];
const stateOf = (hash: string) => {
  if (hash === "a") return "managed" as const;
  if (hash === "b") return "off" as const;
  return "unregistered-conflict" as const;
};

describe("filterByClientEnable", () => {
  it("全部不过滤", () => {
    expect(filterByClientEnable(skills, "all", stateOf).map((s) => s.hash)).toEqual(["a", "b", "c"]);
  });

  it("只看已启用只要受管", () => {
    expect(filterByClientEnable(skills, "on", stateOf).map((s) => s.hash)).toEqual(["a"]);
  });

  it("只看未启用只要 off,不含占用", () => {
    expect(filterByClientEnable(skills, "off", stateOf).map((s) => s.hash)).toEqual(["b"]);
  });
});

describe("fallbackClientState", () => {
  it("visibleIn 含该客户端则当受管", () => {
    expect(fallbackClientState(["claude"], "claude")).toBe("managed");
    expect(fallbackClientState(["cursor"], "claude")).toBe("off");
  });
});
