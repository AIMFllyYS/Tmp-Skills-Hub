import { describe, expect, it } from "vitest";
import { getAction, listActions, type ActionId } from "./registry.js";

const IDS: ActionId[] = ["enable", "disable", "archive", "save", "translate"];

describe("ACTION_REGISTRY", () => {
  it("五个现有写动作都在表里,id 与动词稳定", () => {
    const listed = listActions();
    expect(listed.map((a) => a.id).sort()).toEqual([...IDS].sort());
    expect(getAction("enable").verb).toBe("启用");
    expect(getAction("disable").verb).toBe("停用");
    expect(getAction("archive").verb).toBe("归档");
    expect(getAction("save").verb).toBe("保存");
    expect(getAction("translate").verb).toBe("翻译");
  });

  it("只有归档是破坏性;本批都不带预览", () => {
    for (const id of IDS) {
      const a = getAction(id);
      expect(a.destructive).toBe(id === "archive");
      expect(a.supportsPreview).toBe(false);
      expect(typeof a.execute).toBe("function");
    }
  });
});
