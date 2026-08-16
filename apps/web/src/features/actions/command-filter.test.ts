import { describe, expect, it } from "vitest";
import { actionUnavailableReason, filterActions } from "./command-filter.js";
import { listActions } from "./registry.js";

describe("filterActions", () => {
  it("按动词或 id 能找到 adopt / archive / enable / analyze", () => {
    const all = listActions();
    const ids = (q: string) => filterActions(all, q).map((a) => a.id);
    expect(ids("adopt")).toContain("adopt");
    expect(ids("归档")).toContain("archive");
    expect(ids("enable")).toContain("enable");
    expect(ids("分析")).toContain("analyze");
  });
});

describe("actionUnavailableReason", () => {
  const empty = { hasFocused: false, selectedCount: 0, clientCount: 0, groupCount: 0 };
  it("未选 skill 时需要目标的动作不可用", () => {
    expect(actionUnavailableReason("archive", empty)).toBe("先选一个 skill");
    expect(actionUnavailableReason("enable", empty)).toBe("先选一个 skill");
    expect(actionUnavailableReason("analyze", empty)).toBe("先选一个 skill");
    expect(actionUnavailableReason("adopt", empty)).toBeNull();
  });
});
