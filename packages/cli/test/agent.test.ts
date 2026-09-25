import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { AGENT_MAX_STEPS, createSkillsHubAgent, parseWritePolicy } from "../src/agent/agent.js";
import { agentMessageMetadata, pickUsage } from "../src/agent/metadata.js";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL, resolveThinking } from "../src/agent/models.js";
import { buildAgentSystemPrompt } from "../src/agent/prompt.js";
import { createAgentTools, normalizePlan, WRITE_TOOL_NAMES, type ToolEnv } from "../src/agent/tools.js";

const usage = {
  inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("writePolicy", () => {
  it("缺省 ask,仅 allow 字面量放行", () => {
    expect(parseWritePolicy(undefined)).toBe("ask");
    expect(parseWritePolicy("ask")).toBe("ask");
    expect(parseWritePolicy("allow")).toBe("allow");
    expect(parseWritePolicy("other")).toBe("ask");
  });

  it("写工具名单含启用/归档/收录,不含 list/read", () => {
    expect(WRITE_TOOL_NAMES.has("enable_skills")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("archive_skill")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("adopt_skill")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("list_skills")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("read_skill_file")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("run_cli")).toBe(false);
  });
});

describe("createAgentTools", () => {
  it("库存未配置时读工具返回可读失败", async () => {
    const env: ToolEnv = { home: "/tmp/fake-home", storeRoot: null };
    const tools = createAgentTools(env);
    const listed = await tools.list_skills.execute!({}, { messages: [], abortSignal: new AbortController().signal, toolCallId: "t" });
    expect(listed).toEqual({ ok: false, message: expect.stringContaining("库存未配置") });
  });

  it("read_skill_file:真实库存读 SKILL.md;不存在 target 失败", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-store-"));
    const skillDir = path.join(storeRoot, "skills", "demo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n# demo\n", "utf8");
    await writeFile(
      path.join(storeRoot, "index.json"),
      JSON.stringify({
        version: 1,
        skills: [{ hash: "ab12cdef", dirName: "demo", meta: { name: "demo", description: "d" }, origins: [], installedAt: "2026-01-01T00:00:00.000Z" }],
      }),
      "utf8",
    );
    const tools = createAgentTools({ home: "/tmp/fake-home", storeRoot });
    const opts = { messages: [], abortSignal: new AbortController().signal, toolCallId: "t" };
    const ok = await tools.read_skill_file.execute!({ target: "demo", path: "SKILL.md" }, opts);
    expect(ok).toMatchObject({ ok: true });
    if (ok !== undefined && "content" in ok) expect(String(ok.content)).toContain("# demo");
    const byPrefix = await tools.read_skill_file.execute!({ target: "ab12", path: "SKILL.md" }, opts);
    expect(byPrefix).toMatchObject({ ok: true });
    const missing = await tools.read_skill_file.execute!({ target: "ghost", path: "SKILL.md" }, opts);
    expect(missing).toMatchObject({ ok: false });
  });
});

describe("createSkillsHubAgent", () => {
  it("无工具调用时 generate 返回正文", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "库存里有 1 个 skill" }],
        finishReason: "stop",
        usage,
        warnings: [],
      },
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t0" },
          { type: "text-delta", id: "t0", delta: "库存里有 1 个 skill" },
          { type: "text-end", id: "t0" },
          { type: "finish", finishReason: "stop", usage },
        ]),
      },
    });
    const agent = createSkillsHubAgent({
      model,
      env: { home: "/tmp/fake-home", storeRoot: null },
      clients: [],
      writePolicy: "ask",
    });
    const result = await agent.generate({ prompt: "列出库存" });
    expect(result.text).toContain("skill");
  });
});

describe("update_plan(agent-v0.md §8)", () => {
  it("不是写工具,不受写策略影响", () => {
    expect(WRITE_TOOL_NAMES.has("update_plan")).toBe(false);
  });

  it("回显计划;同一时刻至多一条 in_progress", async () => {
    const tools = createAgentTools({ home: "/tmp/fake-home", storeRoot: null });
    const opts = { messages: [], abortSignal: new AbortController().signal, toolCallId: "t" };
    const out = await tools.update_plan.execute!(
      {
        title: " 整理前端 skill ",
        steps: [
          { title: "查库存", status: "done" },
          { title: "找重复", status: "in_progress" },
          { title: "停用旧版", status: "in_progress" },
        ],
      },
      opts,
    );
    expect(out).toEqual({
      ok: true,
      title: "整理前端 skill",
      steps: [
        { title: "查库存", status: "done" },
        { title: "找重复", status: "in_progress" },
        { title: "停用旧版", status: "pending" },
      ],
    });
  });

  it("normalizePlan 缺省标题为空串", () => {
    expect(normalizePlan({ steps: [{ title: "a", status: "pending" }] }).title).toBe("");
  });
});

describe("深度思考与提示词", () => {
  it("resolveThinking:只有 true 且模型支持时打开", () => {
    expect(resolveThinking(DEFAULT_AGENT_MODEL, true)).toBe(true);
    expect(resolveThinking(DEFAULT_AGENT_MODEL, "true")).toBe(false);
    expect(resolveThinking(DEFAULT_AGENT_MODEL, undefined)).toBe(false);
    const noThinking = AGENT_MODELS.find((m) => !m.thinking);
    if (noThinking !== undefined) expect(resolveThinking(noThinking.id, true)).toBe(false);
    expect(resolveThinking("not-in-list", true)).toBe(false);
  });

  it("提示词含工作法与计划工具;思考提示只在开启时出现", () => {
    const base = { storeRoot: "/s", clients: ["claude"], writePolicy: "ask" as const };
    const off = buildAgentSystemPrompt(base);
    expect(off).toContain("update_plan");
    expect(off).toContain("工作法");
    expect(off).toContain("先批准");
    expect(off).not.toContain("深度思考");
    expect(buildAgentSystemPrompt({ ...base, thinking: true })).toContain("深度思考");
    expect(buildAgentSystemPrompt({ ...base, writePolicy: "allow" })).toContain("全部允许");
  });

  it("循环上限 24", () => {
    expect(AGENT_MAX_STEPS).toBe(24);
  });
});

describe("message metadata(agent-v0.md §9)", () => {
  it("start 写模型与思考;finish 写用量;其它部件不写", () => {
    const meta = agentMessageMetadata({ model: "m1", thinking: true });
    expect(meta({ part: { type: "start" } as never })).toEqual({ model: "m1", thinking: true });
    expect(meta({ part: { type: "text-delta", id: "x", text: "a" } as never })).toBeUndefined();
    const finish = meta({
      part: {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, outputTokenDetails: { reasoningTokens: 3 } },
      } as never,
    });
    expect(finish).toEqual({ usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 3, totalTokens: 15 } });
  });

  it("pickUsage 不把缺报字段填成 0", () => {
    expect(pickUsage(undefined)).toBeUndefined();
    expect(pickUsage({ inputTokens: undefined, outputTokens: 2 } as never)).toEqual({ outputTokens: 2 });
  });
});
