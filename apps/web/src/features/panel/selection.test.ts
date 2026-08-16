import { describe, expect, it } from "vitest";
import { emptySelection, masterCheckState, selectionReducer, selectionSummary } from "./selection.js";

describe("selectionReducer", () => {
  it("toggle 按 hash 增删,不过滤变化", () => {
    let s = emptySelection;
    s = selectionReducer(s, { type: "toggle", hash: "a", next: true });
    s = selectionReducer(s, { type: "toggle", hash: "b", next: true });
    expect([...s.hashes].sort()).toEqual(["a", "b"]);
    s = selectionReducer(s, { type: "toggle", hash: "a", next: false });
    expect([...s.hashes]).toEqual(["b"]);
  });

  it("toggle-visible 只动当前可见集,已选的过滤外项保留", () => {
    let s = selectionReducer(emptySelection, { type: "toggle", hash: "hidden", next: true });
    s = selectionReducer(s, { type: "toggle-visible", hashes: ["a", "b"], next: true });
    expect(s.hashes.has("hidden")).toBe(true);
    expect(s.hashes.has("a")).toBe(true);
    s = selectionReducer(s, { type: "toggle-visible", hashes: ["a", "b"], next: false });
    expect([...s.hashes]).toEqual(["hidden"]);
  });

  it("select-store 是跨过滤的显式一步", () => {
    const s = selectionReducer(emptySelection, { type: "select-store", hashes: ["a", "b", "c"] });
    expect(s.hashes.size).toBe(3);
  });

  it("replace-hash 在保存后跟上身份", () => {
    let s = selectionReducer(emptySelection, { type: "toggle", hash: "old", next: true });
    s = selectionReducer(s, { type: "replace-hash", from: "old", to: "new" });
    expect(s.hashes.has("old")).toBe(false);
    expect(s.hashes.has("new")).toBe(true);
  });

  it("搜索/排序/作用域变化不派发 clear 则选择仍在", () => {
    const s = selectionReducer(emptySelection, { type: "toggle", hash: "keep", next: true });
    const afterFilter = s; // 过滤只改 visible,不碰 reducer
    expect(afterFilter.hashes.has("keep")).toBe(true);
    expect(selectionSummary(["other"], afterFilter.hashes)).toEqual({
      selected: 1,
      selectedVisible: 0,
      hidden: 1,
    });
  });
});

describe("masterCheckState", () => {
  const sel = new Set(["a", "b"]);
  it("三态", () => {
    expect(masterCheckState(["a", "b"], sel)).toBe("all");
    expect(masterCheckState(["a", "c"], sel)).toBe("some");
    expect(masterCheckState(["c"], sel)).toBe("none");
    expect(masterCheckState([], sel)).toBe("none");
  });
});
