import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeSystemPrompt,
  buildAnalyzeContext,
  extractReportJson,
  runAnalyze,
  type RunAnalyzeOptions,
} from "../src/analyze.js";
import { initializeStoreLayout, type SkillRecord } from "@skills-hub/core";

function rec(dirName: string, description: string): SkillRecord {
  return {
    dirName,
    hash: "h-" + dirName,
    meta: { name: dirName, description, version: "0.0.1" },
    origins: [{ kind: "local-scan", reference: dirName }],
    groups: [],
    enabled: true,
    visibleIn: [],
    archived: false,
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
  it("要求只输出 JSON 且不执行写操作", () => {
    const p = analyzeSystemPrompt();
    expect(p).toContain("similar");
    expect(p).toContain("conflict");
    expect(p).toContain("绝不执行任何写操作");
  });
});

describe("extractReportJson", () => {
  it("解析裸 JSON", () => {
    const r = extractReportJson('{"similar":[{"name":"a","reason":"r1"}],"conflict":[]}');
    expect(r.similar).toEqual([{ name: "a", reason: "r1" }]);
    expect(r.conflict).toEqual([]);
  });

  it("容忍 json 围栏与前缀文字", () => {
    const r = extractReportJson("分析结果:\n\x60\x60\x60json\n{\"similar\":[],\"conflict\":[{\"name\":\"b\",\"reason\":\"r2\"}]}\n\x60\x60\x60");
    expect(r.conflict).toEqual([{ name: "b", reason: "r2" }]);
  });

  it("过滤缺字段条目,空数组保留", () => {
    const r = extractReportJson('{"similar":[{"name":"a"},{"name":"c","reason":"ok"}],"conflict":[]}');
    expect(r.similar).toEqual([{ name: "c", reason: "ok" }]);
  });

  it("无 JSON 抛错", () => {
    expect(() => extractReportJson("抱歉,我无法分析")).toThrow(/JSON/);
  });
});

describe("runAnalyze", () => {
  let home = "";
  let storeRoot = "";
  let stockDir = "";
  const tempRoots: string[] = [];

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
    await runAdopt({ home, yes: true, json: true, _: [stockDir] } as never);
  }

  function stubChat(report: unknown): RunAnalyzeOptions["chat"] {
    return async () => ({ ok: true as const, content: JSON.stringify(report) });
  }

  it("库存名输入:产出相近/冲突报告(--json)", async () => {
    await initHome();
    const out: string[] = [];
    const origLog = console.log;
    console.log = (m?: unknown) => { out.push(String(m)); };
    try {
      await runAnalyze({ home, json: true, _: ["stock"] }, { chat: stubChat({ similar: [{ name: "stock", reason: "同 demo" }], conflict: [] }) });
    } finally {
      console.log = origLog;
    }
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
    const chat: RunAnalyzeOptions["chat"] = async (messages) => {
      sent = messages[messages.length - 1]!.content;
      return { ok: true as const, content: '{"similar":[],"conflict":[]}' };
    };
    const origLog = console.log;
    console.log = () => {};
    try {
      await runAnalyze({ home, json: true, _: [targetDir] }, { chat });
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
    console.error = (m?: unknown) => { errs.push(String(m)); };
    try {
      await runAnalyze({ home, json: true, _: ["ghost"] }, { chat: stubChat({}) });
    } finally {
      console.error = origErr;
    }
    expect(errs.join(" ")).toContain("找不到该 skill");
    expect(errs.join(" ")).toContain("ghost");
  });

  it("chat 失败:降级提示不编造", async () => {
    await initHome();
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (m?: unknown) => { errs.push(String(m)); };
    try {
      await runAnalyze({ home, json: true, _: ["stock"] }, { chat: async () => ({ ok: false as const, code: "not-configured" as const, message: "未配置" }) });
    } finally {
      console.error = origErr;
    }
    expect(errs.join(" ")).toContain("DEEPSEEK_API_KEY");
  });
});
