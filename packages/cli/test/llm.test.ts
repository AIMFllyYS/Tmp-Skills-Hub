import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chatCompletion, chatCompletionStream, DEFAULT_QINIU_BASE_URL, llmEndpoint, type LlmStreamEvent } from "../src/llm.js";
import { loadEnvFile } from "../src/env.js";

/** AI 调用封装测试(ai-integration-v1):fetch 用替身隔离,绝不触达真实网络。 */

const KEY = "sk-test-dummy";
const saved: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function saveEnv(...keys: string[]) {
  for (const k of keys) saved[k] = process.env[k];
}

/** 把字符串 chunks 包成 ReadableStream 供 fake fetch 返回。 */
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const events: LlmStreamEvent[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

describe("llm 非流式封装", () => {
  it("未配置密钥:not-configured 可读提示,不崩溃", async () => {
    saveEnv("QINIU_API_KEY");
    delete process.env.QINIU_API_KEY;
    const res = await chatCompletion([{ role: "user", content: "hi" }]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("not-configured");
      expect(res.message).toContain("QINIU_API_KEY");
    }
  });

  it("成功:返回 choices[0].message.content,请求带 Bearer 且关思考", async () => {
    let sentUrl = "";
    let sentHeaders: Record<string, string> = {};
    let sentBody = "";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      sentUrl = String(url);
      sentHeaders = (init?.headers as Record<string, string>) ?? {};
      sentBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "你好" } }] }), { status: 200 });
    }) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toBe("你好");
    expect(sentUrl).toBe(DEFAULT_QINIU_BASE_URL + "/chat/completions");
    expect(sentUrl).toBe(llmEndpoint());
    expect(sentHeaders["authorization"]).toBe("Bearer " + KEY);
    const body = JSON.parse(sentBody) as { model: string; stream: boolean; enable_thinking: boolean };
    expect(body.stream).toBe(false);
    expect(body.enable_thinking).toBe(false);
    expect(body.model).toBe("deepseek/deepseek-v4-flash-20260731");
  });

  it("401:认证失败提示,且响应内容不含密钥", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("api");
      expect(res.message).toContain("认证失败");
      expect(res.message).toContain("QINIU_API_KEY");
      expect(res.message).not.toContain(KEY);
    }
  });

  it("429:限流提示", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("限流");
  });

  it("超时:abort 后返回 timeout,不无限挂起", async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          (init?.signal as AbortSignal | undefined)?.removeEventListener("abort", onAbort);
          resolve();
        };
        (init?.signal as AbortSignal | undefined)?.addEventListener("abort", onAbort);
      });
      throw new Error("aborted");
    }) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl, timeoutMs: 50 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("timeout");
  });

  it("响应结构异常:api 错误", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ nope: true }), { status: 200 })) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("响应结构");
  });
});

describe("llm 流式封装", () => {
  it("纯文本流:text 增量逐段下发,拼出全文", async () => {
    const fetchImpl = (async () =>
      new Response(streamFrom([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n',
      ]), { status: 200 })) as typeof fetch;
    const events = await collect(chatCompletionStream([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl }));
    const kinds = events.map((e) => e.type);
    expect(kinds).toEqual(["text", "text", "done"]);
    const full = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
    expect(full).toBe("你好");
  });

  it("tool_calls 分片:按 index 累积成完整调用", async () => {
    const fetchImpl = (async () =>
      new Response(streamFrom([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"run_"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"cli","arguments":"{\\"arg"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"s\\":1}"}}]}}]}\n\ndata: [DONE]\n\n',
      ]), { status: 200 })) as typeof fetch;
    const events = await collect(chatCompletionStream([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl }));
    const kinds = events.map((e) => e.type);
    expect(kinds).toEqual(["tool_calls", "done"]);
    const callEvent = events[0];
    if (callEvent.type !== "tool_calls") throw new Error("unreachable");
    expect(callEvent.calls).toHaveLength(1);
    expect(callEvent.calls[0]).toEqual({
      id: "call_1",
      type: "function",
      function: { name: "run_cli", arguments: '{"args":1}' },
    });
  });

  it("未配置密钥:首个事件即 error(not-configured)", async () => {
    saveEnv("QINIU_API_KEY");
    delete process.env.QINIU_API_KEY;
    const events = await collect(chatCompletionStream([{ role: "user", content: "hi" }]));
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBe("error");
    if (ev.type === "error") expect(ev.code).toBe("not-configured");
  });

  it("坏 JSON 行跳过不中断;reasoning_content 忽略", async () => {
    const fetchImpl = (async () =>
      new Response(streamFrom([
        'data: {"choices":[{"delta":{"reasoning_content":"思考过程"}}]}\n\n',
        "data: {broken json}\n\n",
        'data: {"choices":[{"delta":{"content":"正文"}}]}\n\ndata: [DONE]\n\n',
      ]), { status: 200 })) as typeof fetch;
    const events = await collect(chatCompletionStream([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl }));
    const kinds = events.map((e) => e.type);
    expect(kinds).toEqual(["text", "done"]);
    const ev = events[0];
    if (ev.type !== "text") throw new Error("unreachable");
    expect(ev.delta).toBe("正文");
  });

  it("HTTP 错误:yield error(api)", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    const events = await collect(chatCompletionStream([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl }));
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBe("error");
    if (ev.type === "error") {
      expect(ev.code).toBe("api");
      expect(ev.message).toContain("限流");
    }
  });
});

describe("env 加载器", () => {
  it("读取 KEY=VALUE,注释与空行跳过,不覆盖已有环境变量", async () => {
    saveEnv("QINIU_API_KEY", "MY_TEST_VAR");
    process.env.MY_TEST_VAR = "already";
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-env-"));
    const file = path.join(dir, ".env");
    await writeFile(
      file,
      ["# comment", "", "QINIU_API_KEY=sk-from-file", "MY_TEST_VAR=should-not-overwrite", "BAD LINE", "A_B=1"].join("\n"),
      "utf8",
    );
    await loadEnvFile(file);
    expect(process.env.QINIU_API_KEY).toBe("sk-from-file");
    expect(process.env.MY_TEST_VAR).toBe("already");
    expect(process.env.A_B).toBe("1");
  });

  it("文件缺失:静默不抛错", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-env-missing-"));
    await expect(loadEnvFile(path.join(dir, "nope.env"))).resolves.toBeUndefined();
  });
});
