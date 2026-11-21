import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import {
  analyzeSystemPrompt,
  buildAnalyzeContext,
  defaultGenerate,
  runAnalyze,
  type AnalyzeGenerate,
} from "../src/analyze.js";
import { initializeStoreLayout, type SkillRecord } from "@skills-hub/core";

const tempRoots: string[] = [];
const savedKeys: Record<string, string | undefined> = {};

afterEach(async () => {
  process.exitCode = 0;
  for (const k of Object.keys(savedKeys)) {
    if (savedKeys[k] === undefined) delete process.env[k];
    else process.env[k] = savedKeys[k];
    delete savedKeys[k];
  }
  await Promise.all(tempRoots.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const usage = {
  inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function rec(dirName: string, description: string): SkillRecord {
  return {
    dirName,
    hash: "h-" + dirName,
    meta: { name: dirName, description },
    origins: [{ kind: "local-scan", reference: dirName }],
    visibleIn: [],
    installedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildAnalyzeContext", () => {
  it("排除目标自身,截断 description", () => {
    const ctx = buildAnalyzeContext([rec("a", "alpha"), rec("b", "beta"), rec("c", "gamma")], { dirName: "b", description: "target" });
    expect(ctx.targetName).toBe("b");
    expect(ctx.stock.map((s) => s.name)).toEqual(["a", "c"]);
  });

  it("超长 description 截断到上限", () => {
    const long = "x".repeat(500);
    const ctx = buildAnalyzeContext([rec("a", long)], { dirName: "b", description: "y".repeat(5000) });
    expect(ctx.stock[0]!.description.length).toBeLessThanOrEqual(200);
    expect(ctx.targetDescription.length).toBeLessThanOrEqual(4000);
  });
});

describe("analyzeSystemPrompt", () => {
  it("要求只输出 JSON 且包含目标结构与禁止写操作声明", () => {
    const p = analyzeSystemPrompt();
    expect(p).toContain("JSON");
    expect(p).toContain("similar");
    expect(p).toContain("conflict");
    expect(p).toContain("reason");
    expect(p).toContain("绝不执行任何写操作");
  });
});

describe("defaultGenerate", () => {
  it("无密钥时返回 not-configured", async () => {
    savedKeys.QINIU_API_KEY = process.env.QINIU_API_KEY;
    delete process.env.QINIU_API_KEY;
    const res = await defaultGenerate({ system: "s", prompt: "p" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not-configured");
  });

  it("MockLanguageModelV3 返回合法 JSON 时解析为结构化报告", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              similar: [{ name: "alpha", reason: "功能重叠" }],
              conflict: [{ name: "beta", reason: "触发条件冲突" }],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    });
    const res = await defaultGenerate({ system: analyzeSystemPrompt(), prompt: "JSON" }, { model });
    expect(res).toEqual({
      ok: true,
      similar: [{ name: "alpha", reason: "功能重叠" }],
      conflict: [{ name: "beta", reason: "触发条件冲突" }],
    });
  });

  it("MockLanguageModelV3 返回非 JSON 文本时映射为 invalid-response", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "not valid json output" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    });
    const res = await defaultGenerate({ system: analyzeSystemPrompt(), prompt: "JSON" }, { model });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid-response");
  });
});

describe("runAnalyze", () => {
  let home = "";
  let storeRoot = "";
  let stockDir = "";

  async function initHome(): Promise<void> {
    home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-analyze-"));
    tempRoots.push(home);
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
    stockDir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-stock-"));
    tempRoots.push(stockDir);
    await writeFile(path.join(stockDir, "SKILL.md"), ["---", "name: stock", "description: 一个库存里的 demo skill", "---", "", "# stock", "", "demo."].join("\n") + "\n", "utf8");
    // --home 语义即 storeRoot 直通(沙箱验证入口)
    storeRoot = home;
    await initializeStoreLayout(storeRoot);
    const { runAdopt } = await import("../src/store-cmds.js");
    await runAdopt({ home, yes: true, dryRun: false, json: true, _: [stockDir] });
  }

  function stubGenerate(report: { similar: Array<{ name: string; reason: string }>; conflict: Array<{ name: string; reason: string }> }): AnalyzeGenerate {
    return async () => ({ ok: true as const, similar: report.similar, conflict: report.conflict });
  }

  it("库存名输入:产出相近/冲突报告(--json),且 user prompt 包含 JSON 关键词", async () => {
    await initHome();
    const out: string[] = [];
    let capturedPrompt = "";
    const origLog = console.log;
    console.log = (m?: unknown) => { out.push(String(m)); };
    try {
      await runAnalyze(
        { home, json: true, _: ["stock"] },
        {
          generate: async (input) => {
            capturedPrompt = input.prompt;
            return { ok: true, similar: [{ name: "stock", reason: "同 demo" }], conflict: [] };
          },
        },
      );
    } finally {
      console.log = origLog;
    }
    expect(capturedPrompt).toContain("JSON");
    const line = out.find((l) => l.startsWith("{"))!;
    const parsed = JSON.parse(line) as { ok: boolean; command: string; target: string; similar: Array<{ name: string }> };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("analyze");
    expect(parsed.target).toBe("stock");
    expect(parsed.similar).toEqual([{ name: "stock", reason: "同 demo" }]);
  });

  it("本地目录输入:读 SKILL.md 的 description", async () => {
    await initHome();
    const targetDir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-target-"));
    tempRoots.push(targetDir);
    await writeFile(path.join(targetDir, "SKILL.md"), ["---", "name: target", "description: 本地待评估 skill", "---", "", "# target", "", "demo."].join("\n") + "\n", "utf8");
    let sent = "";
    const generate: AnalyzeGenerate = async (input) => {
      sent = input.prompt;
      return { ok: true as const, similar: [], conflict: [] };
    };
    const origLog = console.log;
    console.log = () => {};
    try {
      await runAnalyze({ home, json: true, _: [targetDir] }, { generate });
    } finally {
      console.log = origLog;
    }
    expect(sent).toContain("name: target");
    expect(sent).toContain("本地待评估 skill");
  });

  it("既非库存名也非本地目录:not-found", async () => {
    await initHome();
    const errs: string[] = [];
    const origErr = console.error;
    const origLog = console.log;
    console.error = (m?: unknown) => { errs.push(String(m)); };
    console.log = () => {};
    try {
      await runAnalyze({ home, json: true, _: ["ghost"] }, { generate: stubGenerate({ similar: [], conflict: [] }) });
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
    expect(errs.join(" ")).toContain("找不到该 skill");
    expect(errs.join(" ")).toContain("ghost");
    expect(process.exitCode).toBe(2);
  });

  it("未配置密钥:保留 not-configured code 与退出码 2", async () => {
    await initHome();
    const out: string[] = [];
    const errs: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (m?: unknown) => { out.push(String(m)); };
    console.error = (m?: unknown) => { errs.push(String(m)); };
    try {
      await runAnalyze({ home, json: true, _: ["stock"] }, { generate: async () => ({ ok: false as const, code: "not-configured" as const, message: "未配置" }) });
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    const errLine = out.find((l) => l.includes('"not-configured"'));
    expect(errLine).toBeDefined();
    const parsed = JSON.parse(errLine!) as { ok: boolean; command: string; code: string; message: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("analyze");
    expect(parsed.code).toBe("not-configured");
    expect(errs.join(" ")).toContain("API Key");
    expect(process.exitCode).toBe(2);
  });

  it("空输入 --json 返回 bad-usage 信封与退出码 2", async () => {
    await initHome();
    const out: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (m?: unknown) => { out.push(String(m)); };
    console.error = () => {};
    try {
      await runAnalyze({ home, json: true, _: [] });
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    const parsed = JSON.parse(out.find((l) => l.startsWith("{"))!) as { ok: boolean; command: string; code: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("analyze");
    expect(parsed.code).toBe("bad-usage");
    expect(process.exitCode).toBe(2);
  });
});
