/**
 * 相近/冲突分析(#43)。文本判断类任务:按 core-patterns.md §5 交给模型,
 * core 不实现任何相似度算法——分析完全基于 CLI 已有输出(list --json 的
 * description),模型只产出「建议」,本命令不触发任何写操作。
 *
 * 输入:本地 skill 目录路径,或库存中的 skill 名(目录名)。
 * 输出:相近(similar)与可能冲突(conflict)清单,各带理由。
 * 降级:无密钥 → not-configured 可读提示;调用失败/超时 → 可读错误,
 * 绝不编造结论。密钥只从环境变量读,不进报告与日志(封装保证,见 llm.ts)。
 */

import { readSkillMeta, readStoreIndex, type SkillRecord } from "@skills-hub/core";
import path from "node:path";
import { chatCompletion, type ChatOptions, type LlmMessage, type LlmResult } from "./llm.js";
import { emitError, emitOk } from "./json-out.js";
import { resolveSkill } from "./resolve-skill.js";

/** 单个目标最多喂给模型的 description 字符数(防超大 skill 撑爆上下文)。 */
export const MAX_TARGET_DESC_CHARS = 4_000;
/** 库存单条 description 截断,避免大库存超上下文。 */
export const MAX_STOCK_DESC_CHARS = 200;
/** 库存最多纳入多少条对照。 */
export const MAX_STOCK_RECORDS = 400;
/** 分析超时:库存大、推理耗时,比默认 30s 放宽。 */
export const ANALYZE_TIMEOUT_MS = 90_000;

export interface AnalyzeReportItem {
  name: string;
  reason: string;
}

export interface AnalyzeReport {
  target: string;
  similar: AnalyzeReportItem[];
  conflict: AnalyzeReportItem[];
}

export interface AnalyzeArgs {
  home: string | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

interface AnalyzeContext {
  targetName: string;
  targetDescription: string;
  stock: Array<{ name: string; description: string }>;
}

/** 组装给模型的分析上下文(纯函数,可测)。 */
export function buildAnalyzeContext(records: SkillRecord[], target: { dirName: string; description: string }): AnalyzeContext {
  const stock = records
    .filter((s) => s.dirName !== target.dirName)
    .slice(0, MAX_STOCK_RECORDS)
    .map((s) => ({
      name: s.dirName,
      description: s.meta.description.slice(0, MAX_STOCK_DESC_CHARS),
    }));
  return {
    targetName: target.dirName,
    targetDescription: target.description.slice(0, MAX_TARGET_DESC_CHARS),
    stock,
  };
}

/** 系统提示:角色与输出契约(纯函数,可测)。 */
export function analyzeSystemPrompt(): string {
  return [
    "你是一个 Agent Skill 库存的分析助手。用户给出一个待评估的 skill 的 name 与 description,以及库存中其他 skill 的 name 与 description 列表。",
    "你的任务:判断库存里哪些 skill 与它功能相近(similar),哪些可能冲突(conflict,如职责重叠、命名易混、互相干扰)。",
    "只输出一个 JSON 对象,不要任何额外文字,格式:",
    '{"similar":[{"name":"...","reason":"..."}],"conflict":[{"name":"...","reason":"..."}]}',
    "要求:1) 只引用库存列表中真实存在的 name;2) 每条给一句具体理由(基于 description 的相似点或冲突点);3) 没有相近或冲突就输出空数组;4) 这是建议,绝不执行任何写操作;5) 不要在理由中编造库存列表之外的信息。",
  ].join("\n");
}

/** 从模型回复中提取 JSON(容忍 ```json 围栏与前后缀文字)。 */
export function extractReportJson(text: string): { similar: AnalyzeReportItem[]; conflict: AnalyzeReportItem[] } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型回复中没有可解析的 JSON 对象");
  const parsed = JSON.parse(candidate.slice(start, end + 1)) as { similar?: unknown; conflict?: unknown };
  const clean = (v: unknown): AnalyzeReportItem[] =>
    Array.isArray(v)
      ? v.filter((x): x is AnalyzeReportItem => typeof x === "object" && x !== null && typeof (x as { name?: unknown }).name === "string" && typeof (x as { reason?: unknown }).reason === "string").map((x) => ({ name: (x as { name: string }).name, reason: (x as { reason: string }).reason }))
      : [];
  return { similar: clean(parsed.similar), conflict: clean(parsed.conflict) };
}

export interface RunAnalyzeOptions {
  /** 测试注入;缺省走 chatCompletion(读 QINIU_API_KEY,见 ai-integration-v1.md) */
  chat?: (messages: LlmMessage[], opts?: ChatOptions) => Promise<LlmResult>;
  /** HTTP 只认库存 hash/dirName;CLI 默认可再回退本地目录 */
  allowLocalPath?: boolean | undefined;
}

export type AnalyzeFailureCode = "bad-usage" | "not-found" | "not-configured" | "analyze-failed";

export type AnalyzeOutcome =
  | { ok: true; target: string; similar: AnalyzeReportItem[]; conflict: AnalyzeReportItem[] }
  | { ok: false; code: AnalyzeFailureCode; message: string };

/** CLI 与 POST /api/analyze 共用:只读建议,不写库存或链接。 */
export async function performAnalyze(storeRoot: string, input: string, opts: RunAnalyzeOptions = {}): Promise<AnalyzeOutcome> {
  const needle = input.trim();
  if (needle === "") return { ok: false, code: "bad-usage", message: "需要 target(hash 前缀或 dirName)" };
  const records = await readStoreIndex(storeRoot);
  const hit = resolveSkill(needle, records);
  let target: { dirName: string; description: string } | null = null;
  if (hit.ok) {
    target = { dirName: hit.skill.dirName, description: hit.skill.meta.description };
  } else if (hit.code === "ambiguous") {
    return { ok: false, code: "bad-usage", message: hit.message };
  }
  if (target === null && opts.allowLocalPath === true) {
    const meta = await readSkillMeta(path.resolve(needle)).catch(() => null);
    if (meta !== null) target = { dirName: meta.name, description: meta.description };
  }
  if (target === null) {
    return {
      ok: false,
      code: "not-found",
      message: opts.allowLocalPath === true
        ? "找不到该 skill:既不是库存中的名字,也不是含 SKILL.md 的本地目录 — " + needle
        : "库存中没有: " + needle,
    };
  }

  const ctx = buildAnalyzeContext(records, target);
  const chat = opts.chat ?? chatCompletion;
  const result = await chat(
    [
      { role: "system", content: analyzeSystemPrompt() },
      {
        role: "user",
        content: "待评估 skill:\nname: " + ctx.targetName + "\ndescription: " + ctx.targetDescription + "\n\n库存对照:\n" + ctx.stock.map((s) => "- " + s.name + ": " + s.description).join("\n") + "\n\n请输出 JSON。",
      },
    ],
    { timeoutMs: ANALYZE_TIMEOUT_MS },
  );
  if (!result.ok) {
    if (result.code === "not-configured") {
      return { ok: false, code: "not-configured", message: "未配置 QINIU_API_KEY,无法分析 — 请配置密钥后重试(不会编造结论)" };
    }
    return { ok: false, code: "analyze-failed", message: "分析调用失败(" + result.code + "): " + result.message };
  }
  try {
    const report = extractReportJson(result.content);
    return { ok: true, target: ctx.targetName, similar: report.similar, conflict: report.conflict };
  } catch (e) {
    return { ok: false, code: "analyze-failed", message: "模型回复无法解析: " + (e instanceof Error ? e.message : String(e)) + " (请重试)" };
  }
}

export async function runAnalyze(args: AnalyzeArgs, opts: RunAnalyzeOptions = {}): Promise<void> {
  const input = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" ").trim();
  if (input === "") {
    console.error("用法: skills-hub analyze <本地skill目录路径|库存skill名>");
    process.exitCode = 2;
    return;
  }
  const { resolveStoreRootOrFail } = await import("./store-cmds.js");
  const storeRoot = await resolveStoreRootOrFail(args, "analyze");
  if (storeRoot === null) return;

  const res = await performAnalyze(storeRoot, input, { ...opts, allowLocalPath: true });
  if (!res.ok) {
    const code = res.code === "not-found" ? "not-found" : res.code === "bad-usage" ? "bad-usage" : "analyze-failed";
    emitError(args.json === true, "analyze", code, res.message);
    return;
  }
  if (args.json) {
    emitOk("analyze", { target: res.target, similar: res.similar, conflict: res.conflict });
    return;
  }
  console.log("目标: " + res.target);
  console.log(res.similar.length === 0 ? "(未发现相近 skill)" : "相近:");
  for (const s of res.similar) console.log("  ~ " + s.name + " — " + s.reason);
  console.log(res.conflict.length === 0 ? "(未发现冲突)" : "可能冲突:");
  for (const c of res.conflict) console.log("  ! " + c.name + " — " + c.reason);
  console.log("(报告仅为建议,未做任何写操作)");
}
