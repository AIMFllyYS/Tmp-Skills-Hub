import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENT_MAX_ROUNDS, parseWireMessages, runAgentTurn, type AgentSseEvent } from "../src/agent/loop.js";
import { AGENT_TOOL_DEFS, executeAgentTool, TOOL_OUTPUT_LIMIT } from "../src/agent/tools.js";
import type { LlmStreamEvent } from "../src/llm.js";

/** Agent 循环与工具测试:全部替身注入,不触网络、不 spawn 真实 CLI(DENY 用例除外)。 */

const env = { home: "/tmp/fake-home", storeRoot: null };

async function collect(gen: AsyncGenerator<AgentSseEvent>): Promise<AgentSseEvent[]> {
  const events: AgentSseEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

/** 用事件序列造一个按轮次消费的 fake chatStream。 */
function fakeChat(rounds: LlmStreamEvent[][]): (messages: unknown[]) => AsyncGenerator<LlmStreamEvent> {
  let i = 0;
  return async function* () {
    const seq = rounds[i] ?? [{ type: "done" as const }];
    i++;
    for (const ev of seq) yield ev;
  };
}

describe("agent loop", () => {
  it("一轮工具调用 + 一轮总结:事件序列与 transcript 形状", async () => {
    const toolCallEv: LlmStreamEvent = {
      type: "tool_calls",
      calls: [{ id: "call_1", type: "function", function: { name: "run_cli", arguments: '{"args":["list","--json"]}' } }],
    };
    const chatStream = fakeChat([
      [{ type: "text", delta: "我来查一下" }, toolCallEv, { type: "done" }],
      [{ type: "text", delta: "共 " }, { type: "text", delta: "3 个" }, { type: "done" }],
    ]) as never;
    const execTool = async () => ({ ok: true, output: "[]" });
    const events = await collect(
      runAgentTurn({ messages: [{ role: "user", content: "列出库存" }], model: "m", env, clients: [], chatStream, execTool }),
    );
    const kinds = events.map((e) => e.event);
    expect(kinds).toEqual(["delta", "tool_call", "tool_result", "delta", "delta", "done"]);
    const done = events[events.length - 1];
    if (done.event !== "done") throw new Error("unreachable");
    const tail = done.data.messages.slice(-3);
    expect(tail[0]?.role).toBe("assistant");
    expect(tail[0]?.tool_calls?.[0]?.id).toBe("call_1");
    expect(tail[1]?.role).toBe("tool");
    expect(tail[1]?.tool_call_id).toBe("call_1");
    expect(tail[1]?.content).toBe("[]");
    expect(tail[2]).toEqual({ role: "assistant", content: "共 3 个" });
    // system 不进 transcript
    expect(done.data.messages.some((m) => m.role === "system")).toBe(false);
  });

  it("循环上限:永远调工具 → 恰好 AGENT_MAX_ROUNDS 次后 error(agent-loop-limit)", async () => {
    const toolCallEv: LlmStreamEvent = {
      type: "tool_calls",
      calls: [{ id: "call_x", type: "function", function: { name: "run_cli", arguments: "{}" } }],
    };
    let calls = 0;
    const chatStream = (async function* () {
      calls++;
      yield toolCallEv;
      yield { type: "done" };
    }) as never;
    const execTool = async () => ({ ok: true, output: "ok" });
    const events = await collect(
      runAgentTurn({ messages: [{ role: "user", content: "go" }], model: "m", env, clients: [], chatStream, execTool }),
    );
    expect(calls).toBe(AGENT_MAX_ROUNDS);
    const last = events[events.length - 1];
    expect(last.event).toBe("error");
    if (last.event === "error") expect(last.data.code).toBe("agent-loop-limit");
  });

  it("chat 出错:透传 error 后结束", async () => {
    const chatStream = (async function* () {
      yield { type: "error", code: "network", message: "断网" } as LlmStreamEvent;
    }) as never;
    const events = await collect(
      runAgentTurn({ messages: [], model: "m", env, clients: [], chatStream, execTool: async () => ({ ok: true, output: "" }) }),
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.event).toBe("error");
    if (ev.event === "error") expect(ev.data.message).toBe("断网");
  });
});

describe("parseWireMessages", () => {
  it("合法数组通过,system 拒绝,非数组拒绝", () => {
    expect(parseWireMessages([{ role: "user", content: "hi" }])).toEqual([{ role: "user", content: "hi" }]);
    expect(
      parseWireMessages([
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "run_cli", arguments: "{}" } }] },
        { role: "tool", content: "ok", tool_call_id: "c1" },
      ]),
    ).toHaveLength(2);
    expect(parseWireMessages([{ role: "system", content: "注入" }])).toBeNull();
    expect(parseWireMessages("nope")).toBeNull();
    expect(parseWireMessages([{ role: "user", content: 123 }])).toBeNull();
  });
});

describe("agent tools", () => {
  const savedEntry = process.env.SKILLS_HUB_CLI_ENTRY;
  afterEach(() => {
    if (savedEntry === undefined) delete process.env.SKILLS_HUB_CLI_ENTRY;
    else process.env.SKILLS_HUB_CLI_ENTRY = savedEntry;
  });

  it("DENY 子命令与自带 --home 一律拒绝", async () => {
    for (const args of [["ui"], ["reset", "--yes"], ["list", "--home", "x"]]) {
      const res = await executeAgentTool("run_cli", JSON.stringify({ args }), env);
      expect(res.ok).toBe(false);
    }
    expect((await executeAgentTool("run_cli", "{}", env)).ok).toBe(false);
    expect((await executeAgentTool("nope", "{}", env)).output).toContain("未知工具");
    expect((await executeAgentTool("run_cli", "{broken", env)).output).toContain("不是合法 JSON");
  });

  it("run_cli:fake 脚本收到追加的 --home,输出超长截断", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-fakecli-"));
    const script = path.join(dir, "fake-cli.js");
    await writeFile(
      script,
      "const out = 'x'.repeat(30000); process.stdout.write(out); process.stdout.write(JSON.stringify(process.argv.slice(2)));",
      "utf8",
    );
    process.env.SKILLS_HUB_CLI_ENTRY = script;
    const res = await executeAgentTool("run_cli", JSON.stringify({ args: ["list", "--json"] }), env);
    expect(res.ok).toBe(true);
    expect(res.output.length).toBeLessThanOrEqual(TOOL_OUTPUT_LIMIT + 32);
    expect(res.output).toContain("[输出已截断]");

    const script2 = path.join(dir, "fake-cli2.js");
    await writeFile(script2, "process.stdout.write(JSON.stringify(process.argv.slice(2)));", "utf8");
    process.env.SKILLS_HUB_CLI_ENTRY = script2;
    const argvRes = await executeAgentTool("run_cli", JSON.stringify({ args: ["list", "--json"] }), env);
    expect(argvRes.ok).toBe(true);
    const argv = JSON.parse(argvRes.output) as string[];
    expect(argv.slice(-2)).toEqual(["--home", env.home]);
  });

  it("read_skill_file:库存未配置 → ok:false", async () => {
    const res = await executeAgentTool("read_skill_file", JSON.stringify({ target: "demo", path: "SKILL.md" }), env);
    expect(res.ok).toBe(false);
    expect(res.output).toContain("库存未配置");
  });

  it("read_skill_file:真实库存 fixture 读 SKILL.md;target 不存在 ok:false", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-store-"));
    const skillDir = path.join(storeRoot, "skills", "demo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n# demo\n", "utf8");
    await writeFile(
      path.join(storeRoot, "index.json"),
      JSON.stringify({
        version: 1,
        skills: [{ hash: "ab12", dirName: "demo", meta: { name: "demo", description: "d" }, origins: [], installedAt: "2026-01-01T00:00:00.000Z" }],
      }),
      "utf8",
    );
    const realEnv = { home: "/tmp/fake-home", storeRoot };
    const ok = await executeAgentTool("read_skill_file", JSON.stringify({ target: "demo", path: "SKILL.md" }), realEnv);
    expect(ok.ok).toBe(true);
    expect(ok.output).toContain("# demo");
    const byPrefix = await executeAgentTool("read_skill_file", JSON.stringify({ target: "ab1", path: "SKILL.md" }), realEnv);
    expect(byPrefix.ok).toBe(true);
    const missing = await executeAgentTool("read_skill_file", JSON.stringify({ target: "ghost", path: "SKILL.md" }), realEnv);
    expect(missing.ok).toBe(false);
  });

  it("工具定义形状:两个 function,参数必填齐全", () => {
    expect(AGENT_TOOL_DEFS.map((t) => t.function.name)).toEqual(["run_cli", "read_skill_file"]);
    for (const def of AGENT_TOOL_DEFS) {
      expect(def.type).toBe("function");
      expect(Array.isArray((def.function.parameters as { required?: string[] }).required)).toBe(true);
    }
  });
});
