import { describe, expect, it } from "vitest";
import { PLAYBOOK_SECTIONS } from "./registry.js";

describe("playbook registry", () => {
  it("covers design system foundations and all four v0.3 frontend sub-issues", () => {
    const ids = PLAYBOOK_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      "foundations",
      "atoms",
      "motion",
      "shell-chrome",
      "t1-settings",
      "t2-reconcile",
      "t3-conflicts",
      "t5-git",
    ]);
    const issueTags = PLAYBOOK_SECTIONS.filter((s) => s.group === "v03-targets").map((s) => s.issueTag);
    expect(issueTags).toEqual(["T1.3 #241", "T2.4 #245", "T3.3 #248", "T5.3 #253"]);
  });

  it("provides non-empty import hints for every section", () => {
    for (const s of PLAYBOOK_SECTIONS) {
      expect(s.importHint.trim().length).toBeGreaterThan(10);
    }
  });
});
