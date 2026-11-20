import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  collectCompletedWriteToolIds,
  getAgentToolName,
  parseAgentErrorMessage,
  sanitizePersistedMessages,
} from "./agent-helpers.js";

describe("parseAgentErrorMessage", () => {
  it("空值返回 null,纯文本原样保留", () => {
    expect(parseAgentErrorMessage(undefined)).toBeNull();
    expect(parseAgentErrorMessage(null)).toBeNull();
    expect(parseAgentErrorMessage(new Error("网络断开"))).toBe("网络断开");
    expect(parseAgentErrorMessage(new Error(""))).toBe("请求失败");
  });

  it("从 JSON 错误信封中提取干净的人类可读 message", () => {
    const jsonErr = new Error(
      JSON.stringify({ ok: false, command: "agent-chat", code: "not-configured", message: "未配置 QINIU_API_KEY" }),
    );
    expect(parseAgentErrorMessage(jsonErr)).toBe("未配置 QINIU_API_KEY");

    const nestedErr = new Error(JSON.stringify({ error: { message: "模型限流,请稍后重试" } }));
    expect(parseAgentErrorMessage(nestedErr)).toBe("模型限流,请稍后重试");
  });

  it("坏 JSON 回退原始字符串", () => {
    expect(parseAgentErrorMessage(new Error("{not-json"))).toBe("{not-json");
  });
});

describe("sanitizePersistedMessages", () => {
  it("过滤 input-streaming 工具片段、system 消息与空消息", () => {
    const input = [
      { id: "sys", role: "system", parts: [{ type: "text", text: "secret" }] },
      { id: "u1", role: "user", parts: [{ type: "text", text: "你好" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "正在执行" },
          { type: "tool-list_skills", toolCallId: "tc-stream", state: "input-streaming", input: {} },
          {
            type: "tool-enable_skills",
            toolCallId: "tc-done",
            state: "output-available",
            input: { targets: ["a"], clientId: "cursor" },
            output: { ok: true },
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "tool-list_skills", toolCallId: "tc-only-stream", state: "input-streaming", input: {} }],
      },
    ];

    const sanitized = sanitizePersistedMessages(input);
    expect(sanitized).toHaveLength(2);
    expect(sanitized[0]?.id).toBe("u1");
    expect(sanitized[1]?.id).toBe("a1");
    expect(sanitized[1]?.parts).toHaveLength(2);
    expect(sanitized[1]?.parts.map((p) => p.type)).toEqual(["text", "tool-enable_skills"]);
  });

  it("非数组或损坏结构安全回退为空数组", () => {
    expect(sanitizePersistedMessages(null)).toEqual([]);
    expect(sanitizePersistedMessages("bad")).toEqual([]);
  });
});

describe("getAgentToolName / collectCompletedWriteToolIds", () => {
  it("同时识别静态 tool-* 与 dynamic-tool 部件名称", () => {
    const staticPart = {
      type: "tool-enable_skills",
      toolCallId: "c1",
      state: "input-available",
      input: {},
    } as UIMessage["parts"][number];
    const dynamicPart = {
      type: "dynamic-tool",
      toolName: "custom_tool",
      toolCallId: "c2",
      state: "input-available",
      input: {},
    } as UIMessage["parts"][number];
    const textPart = { type: "text", text: "hi" } as UIMessage["parts"][number];

    expect(getAgentToolName(staticPart)).toBe("enable_skills");
    expect(getAgentToolName(dynamicPart)).toBe("custom_tool");
    expect(getAgentToolName(textPart)).toBe("");
  });

  it("仅收集已完成的写工具 toolCallId,跳过读工具与未完成调用", () => {
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-list_skills",
            toolCallId: "read-1",
            state: "output-available",
            input: {},
            output: [],
          },
          {
            type: "tool-enable_skills",
            toolCallId: "write-1",
            state: "output-available",
            input: { targets: ["x"], clientId: "cursor" },
            output: { ok: true },
          },
          {
            type: "tool-archive_skill",
            toolCallId: "write-prelim",
            state: "output-available",
            preliminary: true,
            input: { target: "x" },
            output: {},
          },
          {
            type: "tool-write_skill_file",
            toolCallId: "write-pending",
            state: "approval-requested",
            input: {},
            approval: { id: "ap-1" },
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(collectCompletedWriteToolIds(messages)).toEqual(["write-1"]);
  });
});
