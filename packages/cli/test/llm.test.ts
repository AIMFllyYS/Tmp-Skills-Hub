import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APICallError,
  generateText,
  JSONParseError,
  NoObjectGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";
import { mapLlmError, scrub } from "../src/llm/errors.js";
import {
  createQiniuModel,
  DEFAULT_MODEL,
  DEFAULT_QINIU_BASE_URL,
  injectThinkingOff,
  llmBaseUrl,
  notConfiguredMessage,
  qiniuApiKey,
  resolveModel,
} from "../src/llm/provider.js";
import { loadEnvFile } from "../src/env.js";

const saved: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

afterEach(async () => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
    delete saved[k];
  }
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function saveEnv(...keys: string[]): void {
  for (const k of keys) {
    if (!(k in saved)) saved[k] = process.env[k];
  }
}

describe("qiniu provider 配置", () => {
  it("未配置密钥:qiniuApiKey 为空,提示可读且不含假 key", () => {
    saveEnv("QINIU_API_KEY");
    delete process.env.QINIU_API_KEY;
    expect(qiniuApiKey()).toBeUndefined();
    expect(notConfiguredMessage()).toContain("QINIU_API_KEY");
    expect(notConfiguredMessage()).not.toMatch(/sk-[a-z0-9]{8,}/i);
    expect(() => createQiniuModel(DEFAULT_MODEL)).toThrow(/QINIU_API_KEY/);
  });

  it("resolveModel:显式 > 环境 > 默认;llmBaseUrl 去尾斜杠", () => {
    saveEnv("QINIU_MODEL", "QINIU_BASE_URL");
    delete process.env.QINIU_MODEL;
    expect(resolveModel()).toBe(DEFAULT_MODEL);
    expect(resolveModel("x")).toBe("x");
    process.env.QINIU_MODEL = "env-model";
    expect(resolveModel()).toBe("env-model");
    process.env.QINIU_BASE_URL = "https://example.com/v1/";
    expect(llmBaseUrl()).toBe("https://example.com/v1");
    delete process.env.QINIU_BASE_URL;
    expect(llmBaseUrl()).toBe(DEFAULT_QINIU_BASE_URL);
  });

  it("injectThinkingOff 写入 enable_thinking:false,不覆盖其它字段", () => {
    const body = injectThinkingOff({ model: "m", stream: true });
    expect(body.enable_thinking).toBe(false);
    expect(body.model).toBe("m");
    expect(body.stream).toBe(true);
  });

  it("createQiniuModel 使用定制 fetch 发送 Bearer 认证与 enable_thinking:false", async () => {
    saveEnv("QINIU_API_KEY", "QINIU_BASE_URL");
    process.env.QINIU_API_KEY = "qiniu-dummy-secret-99";
    process.env.QINIU_BASE_URL = "https://mock-qiniu.local/v1/";

    let seenUrl = "";
    let seenAuth = "";
    let seenBody: Record<string, unknown> = {};

    const fakeFetch: typeof fetch = async (input, init) => {
      seenUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      seenAuth = headers.get("authorization") ?? "";
      seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: "cmpl-1",
          object: "chat.completion",
          created: 1700000000,
          model: DEFAULT_MODEL,
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const model = createQiniuModel(DEFAULT_MODEL, { fetch: fakeFetch });
    const res = await generateText({ model, prompt: "ping" });
    expect(res.text).toBe("ok");
    expect(seenUrl).toBe("https://mock-qiniu.local/v1/chat/completions");
    expect(seenAuth).toBe("Bearer qiniu-dummy-secret-99");
    expect(seenBody.enable_thinking).toBe(false);
    expect(seenBody.model).toBe(DEFAULT_MODEL);
  });
});

describe("mapLlmError & scrub", () => {
  it("401 指向 QINIU_API_KEY,不回显密钥", () => {
    const mapped = mapLlmError(
      new APICallError({
        message: "unauthorized sk-secretvalue",
        url: "https://api.qnaigc.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
      }),
    );
    expect(mapped.code).toBe("api");
    expect(mapped.message).toContain("QINIU_API_KEY");
    expect(mapped.message).not.toContain("sk-secretvalue");
  });

  it("解包 RetryError 并将 429/500/503 映射为中文提示", () => {
    const cases: Array<[number, string]> = [
      [429, "限流"],
      [500, "服务端错误"],
      [503, "过载"],
    ];
    for (const [statusCode, expectedHint] of cases) {
      const inner = new APICallError({
        message: "failed " + statusCode,
        url: "https://api.qnaigc.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode,
      });
      const retry = new RetryError({
        message: "max retries exceeded",
        reason: "maxRetriesExceeded",
        errors: [inner],
      });
      const mapped = mapLlmError(retry);
      expect(mapped.code).toBe("api");
      expect(mapped.message).toContain(expectedHint);
    }
  });

  it("区分 TimeoutError(timeout) 与 AbortError(aborted)", () => {
    const timeoutErr = new DOMException("timed out", "TimeoutError");
    expect(mapLlmError(timeoutErr)).toEqual({ code: "timeout", message: "AI 调用超时,请稍后重试" });

    const abortErr = new DOMException("aborted", "AbortError");
    expect(mapLlmError(abortErr)).toEqual({ code: "aborted", message: "请求已中止" });

    const plainAbort = new Error("Request aborted");
    plainAbort.name = "AbortError";
    expect(mapLlmError(plainAbort).code).toBe("aborted");
  });

  it("NoObjectGeneratedError / JSONParseError / TypeValidationError → invalid-response", () => {
    const noObj = new NoObjectGeneratedError({
      message: "no object",
      response: { id: "r1", timestamp: new Date(), modelId: DEFAULT_MODEL },
      usage: {
        inputTokens: 1,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
        outputTokens: 1,
        outputTokenDetails: { textTokens: 1, reasoningTokens: undefined },
        totalTokens: 2,
      },
      finishReason: "stop",
    });
    expect(mapLlmError(noObj).code).toBe("invalid-response");
    expect(mapLlmError(noObj).message).toContain("格式无效");

    const jsonErr = new JSONParseError({ text: "{bad", cause: new SyntaxError("bad") });
    expect(mapLlmError(jsonErr).code).toBe("invalid-response");

    const typeErr = new TypeValidationError({ value: {}, cause: new Error("bad") });
    expect(mapLlmError(typeErr).code).toBe("invalid-response");
  });

  it("scrub 遮罩 sk-* 与进程中的 QINIU_API_KEY / GITHUB_TOKEN(>= 8)", () => {
    saveEnv("QINIU_API_KEY", "GITHUB_TOKEN");
    process.env.QINIU_API_KEY = "qn_live_secret_12345";
    process.env.GITHUB_TOKEN = "ghp_secret_token_999";

    const raw = "failed with qn_live_secret_12345 and ghp_secret_token_999 and sk-abc123456";
    const cleaned = scrub(raw);
    expect(cleaned).not.toContain("qn_live_secret_12345");
    expect(cleaned).not.toContain("ghp_secret_token_999");
    expect(cleaned).not.toContain("sk-abc123456");
    expect(cleaned).toBe("failed with [redacted] and [redacted] and [redacted]");

    const netErr = mapLlmError(new Error("dial failed qn_live_secret_12345"));
    expect(netErr.code).toBe("network");
    expect(netErr.message).not.toContain("qn_live_secret_12345");
  });
});

describe("loadEnvFile", () => {
  it("读取 KEY=VALUE,忽略注释并保留已有环境变量", async () => {
    saveEnv("TEST_ENV_A", "TEST_ENV_B", "TEST_ENV_QUOTED");
    delete process.env.TEST_ENV_A;
    process.env.TEST_ENV_B = "already-set";
    delete process.env.TEST_ENV_QUOTED;

    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-env-"));
    tempDirs.push(dir);
    const envPath = path.join(dir, ".env");
    await writeFile(
      envPath,
      [
        "# comment line",
        "",
        "TEST_ENV_A=loaded-a",
        "TEST_ENV_B=should-not-overwrite",
        'TEST_ENV_QUOTED="quoted value"',
      ].join("\n"),
      "utf8",
    );

    await loadEnvFile(envPath);
    expect(process.env.TEST_ENV_A).toBe("loaded-a");
    expect(process.env.TEST_ENV_B).toBe("already-set");
    expect(process.env.TEST_ENV_QUOTED).toBe("quoted value");
  });

  it("无参数调用先读 cwd/.env,再回落 <home>/.skills-hub/.env", async () => {
    saveEnv("SKILLS_HUB_HOME", "ENV_ONLY_CWD", "ENV_ONLY_HOME", "ENV_BOTH");
    delete process.env.ENV_ONLY_CWD;
    delete process.env.ENV_ONLY_HOME;
    delete process.env.ENV_BOTH;

    const root = await mkdtemp(path.join(os.tmpdir(), "skills-hub-env-fallback-"));
    tempDirs.push(root);
    const cwdDir = path.join(root, "cwd");
    const homeDir = path.join(root, "home");
    await mkdir(cwdDir, { recursive: true });
    await mkdir(path.join(homeDir, ".skills-hub"), { recursive: true });

    await writeFile(path.join(cwdDir, ".env"), "ENV_ONLY_CWD=from-cwd\nENV_BOTH=from-cwd\n", "utf8");
    await writeFile(path.join(homeDir, ".skills-hub", ".env"), "ENV_ONLY_HOME=from-home\nENV_BOTH=from-home\n", "utf8");
    process.env.SKILLS_HUB_HOME = homeDir;

    const prevCwd = process.cwd();
    process.chdir(cwdDir);
    try {
      await loadEnvFile();
    } finally {
      process.chdir(prevCwd);
    }
    expect(process.env.ENV_ONLY_CWD).toBe("from-cwd");
    expect(process.env.ENV_ONLY_HOME).toBe("from-home");
    expect(process.env.ENV_BOTH).toBe("from-cwd");
  });
});
