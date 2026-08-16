import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest"
import { chatCompletion, DEEPSEEK_ENDPOINT } from "../src/deepseek.js";
import { loadEnvFile } from "../src/env.js";

/** #42:调用封装测试——fetch 用替身隔离,绝不触达真实网络。 */

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

describe("deepseek 封装", () => {
  it("未配置密钥:not-configured 可读提示,不崩溃", async () => {
    saveEnv("DEEPSEEK_API_KEY");
    delete process.env.DEEPSEEK_API_KEY;
    const res = await chatCompletion([{ role: "user", content: "hi" }]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("not-configured");
      expect(res.message).toContain("DEEPSEEK_API_KEY");
    }
  });

  it("成功:返回 choices[0].message.content,请求带 Bearer 且不发密钥", async () => {
    let sentHeaders: Record<string, string> = {};
    let sentBody = "";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      sentHeaders = (init?.headers as Record<string, string>) ?? {};
      sentBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: "你好" } }] }), { status: 200 });
    }) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toBe("你好");
    expect(sentHeaders["authorization"]).toBe("Bearer " + KEY);
    const body = JSON.parse(sentBody) as { model: string; messages: { role: string }[]; stream: boolean };
    expect(body.messages[0].role).toBe("user");
    expect(body.stream).toBe(false);
    expect(DEEPSEEK_ENDPOINT).toBe("https://api.deepseek.com/chat/completions");
  });

  it("401:认证失败提示,且响应内容不含密钥", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const res = await chatCompletion([{ role: "user", content: "hi" }], { apiKey: KEY, fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("api");
      expect(res.message).toContain("认证失败");
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

describe("env 加载器", () => {
  it("读取 KEY=VALUE,注释与空行跳过,不覆盖已有环境变量", async () => {
    saveEnv("DEEPSEEK_API_KEY", "MY_TEST_VAR");
    process.env.MY_TEST_VAR = "already";
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-env-"));
    const file = path.join(dir, ".env");
    await writeFile(
      file,
      ["# comment", "", "DEEPSEEK_API_KEY=sk-from-file", "MY_TEST_VAR=should-not-overwrite", "BAD LINE", "A_B=1"].join("\n"),
      "utf8",
    );
    await loadEnvFile(file);
    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-from-file");
    expect(process.env.MY_TEST_VAR).toBe("already");
    expect(process.env.A_B).toBe("1");
  });

  it("文件缺失:静默不抛错", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-env-missing-"));
    await expect(loadEnvFile(path.join(dir, "nope.env"))).resolves.toBeUndefined();
  });
});
