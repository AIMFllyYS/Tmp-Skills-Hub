import { describe, expect, it } from "vitest";
import { buildBlocks, plainTextOf, type AnyPart } from "./message-blocks.js";
import { names, readPlan, toolMeta } from "./tool-meta.js";

const tool = (name: string, state: string, extra: Record<string, unknown> = {}): AnyPart =>
  ({ type: "tool-" + name, toolCallId: name + "-" + state, state, input: {}, ...extra }) as unknown as AnyPart;

describe("buildBlocks", () => {
  it("连续只读工具合成一个活动组,中间的空文本与 step-start 不打断", () => {
    const blocks = buildBlocks([
      { type: "step-start" },
      tool("list_skills", "output-available", { output: [] }),
      { type: "text", text: "  " },
      { type: "step-start" },
      tool("show_skill", "output-available", { output: { dirName: "pptx" } }),
      { type: "text", text: "库存里有 pptx。" },
    ] as AnyPart[]);
    expect(blocks.map((b) => b.kind)).toEqual(["activity", "text"]);
    const activity = blocks[0];
    expect(activity?.kind === "activity" ? activity.tools.length : 0).toBe(2);
  });

  it("写工具单独成卡,并打断活动组", () => {
    const blocks = buildBlocks([
      tool("list_skills", "output-available"),
      tool("enable_skills", "approval-requested", { approval: { id: "a1" } }),
      tool("show_skill", "output-available"),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["activity", "write", "activity"]);
  });

  it("计划只保留一块,内容是最新一版", () => {
    const blocks = buildBlocks([
      tool("update_plan", "output-available", { output: { ok: true, title: "整理", steps: [{ title: "查库存", status: "in_progress" }] } }),
      tool("list_skills", "output-available"),
      tool("update_plan", "output-available", { output: { ok: true, title: "整理", steps: [{ title: "查库存", status: "done" }] } }),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["plan", "activity"]);
    const plan = blocks[0];
    expect(plan?.kind === "plan" ? plan.plan.steps[0]?.status : null).toBe("done");
  });

  it("连续推理合并;空推理(已结束)丢弃;流式标记跟随最后一段", () => {
    const blocks = buildBlocks([
      { type: "reasoning", text: "先查库存", state: "done" },
      { type: "step-start" },
      { type: "reasoning", text: "再看链接", state: "streaming" },
      { type: "reasoning", text: "", state: "done" },
    ] as AnyPart[]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "reasoning", text: "先查库存\n\n再看链接", streaming: false });
  });

  it("plainTextOf 只取正文", () => {
    expect(plainTextOf([{ type: "reasoning", text: "想" }, { type: "text", text: "答" }] as AnyPart[])).toBe("答");
  });
});

describe("tool-meta", () => {
  it("写工具给出「将要做什么」", () => {
    const meta = toolMeta("enable_skills");
    expect(meta.kind).toBe("write");
    expect(meta.intent?.({ targets: ["pptx", "docx", "pdf"], clientId: "codex" })).toBe("把 pptx、docx 等 3 个 链接到 codex");
  });

  it("结果摘要:数组计数;失败信封透出 message", () => {
    expect(toolMeta("list_skills").output([1, 2, 3])).toBe("3 个 skill");
    expect(toolMeta("list_skills").output({ ok: false, message: "库存未配置" })).toBe("库存未配置");
    expect(toolMeta("read_skill_file").output({ ok: true, content: "a\nb" })).toBe("2 行");
  });

  it("未知工具回落为只读 + 原名", () => {
    expect(toolMeta("mystery")).toMatchObject({ label: "mystery", kind: "read" });
  });

  it("names 缩写与 readPlan 容错", () => {
    expect(names(["a"])).toBe("a");
    expect(names([])).toBe("");
    expect(readPlan({ steps: [{ title: "x", status: "weird" }, { title: "" }] })).toEqual({
      title: "",
      steps: [{ title: "x", status: "pending" }],
    });
    expect(readPlan({ steps: "no" })).toBeNull();
  });
});
