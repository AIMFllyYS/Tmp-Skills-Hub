import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolSet } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { executeReconcile, initializeStoreLayout, readConflicts, type HubPaths } from "@skills-hub/core";
import { createSkillsHubAgent, parseWritePolicy } from "../src/agent/agent.js";
import { buildAgentSystemPrompt } from "../src/agent/prompt.js";
import {
  createAgentTools,
  dump,
  safeToolExecute,
  TOOL_OUTPUT_LIMIT,
  WRITE_TOOL_NAMES,
  type ToolEnv,
} from "../src/agent/tools.js";

const tempDirs: string[] = [];
const savedEnv: Record<string, string | undefined> = {};

afterEach(async () => {
  for (const k of Object.keys(savedEnv)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
    delete savedEnv[k];
  }
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const usage = {
  inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const execOpts = () => ({
  messages: [],
  abortSignal: new AbortController().signal,
  toolCallId: "t",
  context: undefined,
});

async function runTool(t: ToolSet[string] | undefined, input: unknown): Promise<unknown> {
  if (t?.execute === undefined) throw new Error("tool missing execute");
  return t.execute(input as never, execOpts());
}

describe("writePolicy", () => {
  it("缺省 ask,仅 allow 字面量放行", () => {
    expect(parseWritePolicy(undefined)).toBe("ask");
    expect(parseWritePolicy("ask")).toBe("ask");
    expect(parseWritePolicy("allow")).toBe("allow");
    expect(parseWritePolicy("other")).toBe("ask");
  });

  it("写工具名单含启用/归档/收录,不含 list/read/list_drafts", () => {
    expect(WRITE_TOOL_NAMES.has("enable_skills")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("archive_skill")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("adopt_skill")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("list_skills")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("read_skill_file")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("list_drafts")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("run_cli")).toBe(false);
  });
});

describe("buildAgentSystemPrompt", () => {
  it("准确描述版本快照(archive/versions/)与 zip 归档,不含过期 store 不可变字样", () => {
    const p = buildAgentSystemPrompt({ storeRoot: "/tmp/store", clients: ["claude"], writePolicy: "ask" });
    expect(p).toContain("archive/versions/");
    expect(p).toContain("archive/");
    expect(p).toContain("list_drafts");
    expect(p).not.toContain("不可变");
  });
});

describe("dump & safeToolExecute", () => {
  it("dump 超出 TOOL_OUTPUT_LIMIT 时返回 ok:true, truncated:true, preview", () => {
    const huge = { items: ["x".repeat(TOOL_OUTPUT_LIMIT + 500)] };
    const out = dump(huge) as { ok?: boolean; truncated?: boolean; preview?: string };
    expect(out.ok).toBe(true);
    expect(out.truncated).toBe(true);
    expect(typeof out.preview).toBe("string");
    expect(out.preview).toContain("[输出已截断]");
    expect(out.preview!.length).toBeLessThanOrEqual(TOOL_OUTPUT_LIMIT + 20);
  });

  it("safeToolExecute 捕获异常返回 { ok:false, message } 并脱敏密钥", async () => {
    savedEnv.QINIU_API_KEY = process.env.QINIU_API_KEY;
    process.env.QINIU_API_KEY = "qn_agent_secret_98765";
    const wrapped = safeToolExecute(async () => {
      throw new Error("boom with qn_agent_secret_98765 and sk-testsecret123");
    });
    const res = await wrapped({});
    expect(res).toEqual({
      ok: false,
      message: "boom with [redacted] and [redacted]",
    });
  });
});

describe("createAgentTools", () => {
  it("库存未配置时读工具返回可读失败", async () => {
    const env: ToolEnv = { home: "/tmp/fake-home", storeRoot: null };
    const tools = createAgentTools(env);
    const listed = await runTool(tools.list_skills, {});
    expect(listed).toEqual({ ok: false, message: expect.stringContaining("库存未配置") });
  });

  it("read_skill_file:真实库存读 SKILL.md;不存在 target 失败", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-store-"));
    tempDirs.push(storeRoot);
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
    const ok = await runTool(tools.read_skill_file, { target: "demo", path: "SKILL.md" });
    expect(ok).toMatchObject({ ok: true });
    if (ok !== null && typeof ok === "object" && "content" in ok) expect(String(ok.content)).toContain("# demo");
    const byPrefix = await runTool(tools.read_skill_file, { target: "ab12", path: "SKILL.md" });
    expect(byPrefix).toMatchObject({ ok: true });
    const missing = await runTool(tools.read_skill_file, { target: "ghost", path: "SKILL.md" });
    expect(missing).toMatchObject({ ok: false });
  });

  it("草稿完整流:create_draft → list_drafts → write_skill_file → read_skill_file → commit_draft", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-draft-"));
    tempDirs.push(storeRoot);
    await initializeStoreLayout(storeRoot);
    const tools = createAgentTools({ home: storeRoot, storeRoot });

    const created = await runTool(tools.create_draft, { dirName: "draft-a", description: "initial desc" });
    expect(created).toMatchObject({ ok: true, verb: "allocate", dirName: "draft-a" });

    const drafts = await runTool(tools.list_drafts, {});
    expect(Array.isArray(drafts)).toBe(true);
    expect((drafts as Array<{ dirName: string }>).map((d) => d.dirName)).toContain("draft-a");

    const updatedMd = "---\nname: draft-a\ndescription: edited draft desc\n---\n\n# draft-a\n\nupdated body\n";
    const written = await runTool(tools.write_skill_file, { target: "drafts/draft-a", path: "SKILL.md", content: updatedMd });
    expect(written).toMatchObject({ ok: true, path: "SKILL.md" });

    const readBack = await runTool(tools.read_skill_file, { target: "draft-a", path: "SKILL.md" });
    expect(readBack).toMatchObject({ ok: true, path: "SKILL.md" });
    if (readBack !== null && typeof readBack === "object" && "content" in readBack) {
      expect(String(readBack.content)).toContain("updated body");
    }

    const committed = await runTool(tools.commit_draft, { dirName: "draft-a" });
    expect(committed).toMatchObject({ ok: true, verb: "commit", dirName: "draft-a" });

    const draftsAfter = await runTool(tools.list_drafts, {});
    expect(draftsAfter).toEqual([]);
  });

  it("scan_clients 传 storeRoot,不把库存自身 skills 目录扫成客户端", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-scan-"));
    tempDirs.push(home);
    await initializeStoreLayout(home);
    const storeSkill = path.join(home, "skills", "in-store");
    await mkdir(storeSkill, { recursive: true });
    await writeFile(path.join(storeSkill, "SKILL.md"), "---\nname: in-store\ndescription: stock\n---\n", "utf8");
    const claudeSkill = path.join(home, ".claude", "skills", "client-only");
    await mkdir(claudeSkill, { recursive: true });
    await writeFile(path.join(claudeSkill, "SKILL.md"), "---\nname: client-only\ndescription: client\n---\n", "utf8");

    const tools = createAgentTools({ home, storeRoot: home });
    const scanned = (await runTool(tools.scan_clients, {})) as Array<{ clientId: string; name: string }>;
    expect(scanned.map((s) => s.name)).toContain("client-only");
    expect(scanned.map((s) => s.name)).not.toContain("in-store");
  });
});

describe("createSkillsHubAgent", () => {
  it("reads conflict evidence before requesting approval and leaves the active version intact", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-conflicts-"));
    tempDirs.push(home);
    const paths: HubPaths = { stateRoot: path.join(home, "state"), skillsRoot: path.join(home, "assets"), layoutMode: "split" };
    await initializeStoreLayout(paths);
    const content = (text: string) => "---\nname: demo\ndescription: sandbox only\n---\n" + text;
    const secret = "ghp_" + "x".repeat(36);
    for (const [client, text, time] of [
      ["claude", "secret fixture " + secret, 1_750_000_000], ["codex", "new draft", 1_750_000_100],
    ] as const) {
      const folder = path.join(home, "." + client, "skills", "demo");
      await mkdir(folder, { recursive: true });
      const md = path.join(folder, "SKILL.md");
      await writeFile(md, content(text));
      await utimes(md, time, time);
    }
    expect(await executeReconcile(home, paths)).toMatchObject({ ok: true, conflictCount: 1, failures: [] });
    const record = (await readConflicts(paths))[0]!;
    const variantId = record.variants.find((variant) => variant.hash !== record.activeHash)!.variantId;
    const calls = [
      ["list_conflicts", {}],
      ["diff_conflict_variants", { skillName: "demo", variantB: variantId }],
      ["read_conflict_file", { skillName: "demo", variantId, path: "SKILL.md" }],
      ["apply_conflict_resolution", { skillName: "demo", mode: "pick", winnerVariantId: variantId, summary: "恢复完整版本" }],
    ] as const;
    const model = new MockLanguageModelV3({
      doGenerate: calls.map(([toolName, input], i) => ({
        content: [{ type: "tool-call" as const, toolCallId: "conflict-" + String(i), toolName, input: JSON.stringify(input) }],
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage, warnings: [],
      })),
    });
    const agent = createSkillsHubAgent({ model, env: { home, storeRoot: paths.stateRoot, paths }, clients: [], writePolicy: "ask" });
    const result = await agent.generate({ prompt: "请先检查证据，再提交决议等我确认" });
    expect(result.steps.flatMap((step) => step.toolCalls).map((call) => call.toolName)).toEqual(calls.map(([name]) => name));
    const results = JSON.stringify(result.steps.flatMap((step) => step.toolResults));
    expect(results).toContain("[redacted]");
    expect(results).not.toContain(secret);
    expect(result.content.some((part) => part.type === "tool-approval-request")).toBe(true);
    expect(await readConflicts(paths)).toEqual([record]);
    expect(await readFile(path.join(paths.skillsRoot, "demo", "SKILL.md"), "utf8")).toBe(content("new draft"));
  });

  it("无工具调用时 generate 返回正文", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "库存里有 1 个 skill" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t0" },
          { type: "text-delta", id: "t0", delta: "库存里有 1 个 skill" },
          { type: "text-end", id: "t0" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
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

  it("toolApproval:ask 暂停写工具生成 approval-request,allow 自动执行写工具", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-approval-"));
    tempDirs.push(storeRoot);
    await initializeStoreLayout(storeRoot);

    const askModel = new MockLanguageModelV3({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "tc-draft-1",
              toolName: "create_draft",
              input: JSON.stringify({ dirName: "ask-draft", description: "need approval" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "等待批准" }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });
    const askAgent = createSkillsHubAgent({
      model: askModel,
      env: { home: storeRoot, storeRoot },
      clients: [],
      writePolicy: "ask",
    });
    const askResult = await askAgent.generate({ prompt: "新建草稿 ask-draft" });
    const hasApprovalReq = askResult.content.some((part) => part.type === "tool-approval-request");
    expect(hasApprovalReq).toBe(true);
    const draftsWhileAsk = await runTool(createAgentTools({ home: storeRoot, storeRoot }).list_drafts, {});
    expect(draftsWhileAsk).toEqual([]);

    const allowModel = new MockLanguageModelV3({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "tc-draft-2",
              toolName: "create_draft",
              input: JSON.stringify({ dirName: "allow-draft", description: "auto approved" }),
            },
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        {
          content: [{ type: "text", text: "已创建草稿 allow-draft" }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        },
      ],
    });
    const allowAgent = createSkillsHubAgent({
      model: allowModel,
      env: { home: storeRoot, storeRoot },
      clients: [],
      writePolicy: "allow",
    });
    const allowResult = await allowAgent.generate({ prompt: "新建草稿 allow-draft" });
    expect(allowResult.text).toContain("allow-draft");
    const draftsAfterAllow = (await runTool(createAgentTools({ home: storeRoot, storeRoot }).list_drafts, {})) as Array<{ dirName: string }>;
    expect(draftsAfterAllow.map((d) => d.dirName)).toContain("allow-draft");
  });
});
