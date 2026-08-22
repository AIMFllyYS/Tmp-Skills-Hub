/**
 * Agent 工具执行(agent-v0.md §3):run_cli 子进程 + read_skill_file 直读。
 * 一切失败都以 ok:false 文本返回给模型,绝不抛异常中断对话循环。
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillFile, readStoreIndex } from "@skills-hub/core";
import type { LlmToolDef } from "../llm.js";
import { resolveSkill } from "../resolve-skill.js";

/** 工具输出回给模型的最大字符数(防超大输出撑爆上下文)。 */
export const TOOL_OUTPUT_LIMIT = 24_000;
/** run_cli 子进程超时。 */
export const TOOL_TIMEOUT_MS = 60_000;
/** Agent 中被禁止的 CLI 子命令(会起服务/改基座/整体重置)。 */
const DENY_SUBCOMMANDS = new Set(["ui", "bootstrap", "reset"]);

export const AGENT_TOOL_DEFS: LlmToolDef[] = [
  {
    type: "function",
    function: {
      name: "run_cli",
      description: "执行 skills-hub CLI 子命令,返回 stdout+stderr 文本。写操作需带 --yes;查询带 --json。",
      parameters: {
        type: "object",
        properties: {
          args: { type: "array", items: { type: "string" }, description: "命令参数数组,如 [\"list\",\"--json\"]" },
        },
        required: ["args"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_skill_file",
      description: "读取库存中某个 skill 的文件内容。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "skill 的 dirName 或 hash 前缀" },
          path: { type: "string", description: "skill 内相对路径,如 SKILL.md" },
        },
        required: ["target", "path"],
      },
    },
  },
];

export interface ToolExecResult {
  ok: boolean;
  output: string;
}

export interface ToolEnv {
  home: string;
  storeRoot: string | null;
}

function truncate(text: string): string {
  return text.length > TOOL_OUTPUT_LIMIT ? text.slice(0, TOOL_OUTPUT_LIMIT) + "\n[输出已截断]" : text;
}

/** CLI 入口:编译后 dist/agent/tools.js 的 ../index.js;SKILLS_HUB_CLI_ENTRY 供测试覆盖。 */
function resolveCliEntry(): string {
  const override = process.env.SKILLS_HUB_CLI_ENTRY;
  if (override !== undefined && override !== "") return override;
  return fileURLToPath(new URL("../index.js", import.meta.url));
}

async function runCli(args: unknown, env: ToolEnv): Promise<ToolExecResult> {
  if (!Array.isArray(args) || args.length === 0 || args.some((a) => typeof a !== "string")) {
    return { ok: false, output: "args 需要是非空字符串数组,如 [\"list\",\"--json\"]" };
  }
  const argv = args as string[];
  if (DENY_SUBCOMMANDS.has(argv[0] ?? "")) {
    return { ok: false, output: "此命令在 Agent 中被禁用: " + String(argv[0]) };
  }
  if (argv.includes("--home")) {
    return { ok: false, output: "--home 由系统注入,不允许自带" };
  }
  const entry = resolveCliEntry();
  if (entry.endsWith(".ts")) {
    return { ok: false, output: "Agent 工具需要构建产物:请先运行 pnpm build 再重启 ui。" };
  }
  return new Promise<ToolExecResult>((resolve) => {
    let output = "";
    let settled = false;
    const finish = (ok: boolean, extra = ""): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const merged = output + extra;
      resolve(merged === "" ? { ok, output: "(无输出)" } : { ok, output: truncate(merged) });
    };
    const child = spawn(process.execPath, [entry, ...argv, "--home", env.home], { env: process.env, windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      finish(false, "\n[已超时终止(" + String(TOOL_TIMEOUT_MS / 1000) + "s)]");
    }, TOOL_TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.on("error", (e) => finish(false, "\n[子进程错误: " + e.message + "]"));
    child.on("close", (code) => finish(code === 0));
  });
}

async function readSkillFileTool(parsed: { target?: unknown; path?: unknown }, env: ToolEnv): Promise<ToolExecResult> {
  const target = typeof parsed.target === "string" ? parsed.target.trim() : "";
  const rel = typeof parsed.path === "string" ? parsed.path.trim() : "";
  if (target === "" || rel === "") return { ok: false, output: "需要 target(dirName 或 hash 前缀)与 path(skill 内相对路径)" };
  if (env.storeRoot === null) return { ok: false, output: "库存未配置:先运行 skills-hub init。" };
  const skills = await readStoreIndex(env.storeRoot).catch(() => null);
  if (skills === null) return { ok: false, output: "库存读取失败" };
  const hit = resolveSkill(target, skills);
  if (!hit.ok) return { ok: false, output: hit.message };
  const res = await readSkillFile(path.join(env.storeRoot, "skills", hit.skill.dirName), rel);
  if (!res.ok) return { ok: false, output: res.message };
  return { ok: true, output: truncate(res.content) };
}

export async function executeAgentTool(name: string, argsJson: string, env: ToolEnv): Promise<ToolExecResult> {
  let parsed: { args?: unknown; target?: unknown; path?: unknown };
  try {
    parsed = JSON.parse(argsJson) as typeof parsed;
  } catch (e) {
    return { ok: false, output: "工具参数不是合法 JSON: " + (e instanceof Error ? e.message : String(e)) };
  }
  if (name === "run_cli") return runCli(parsed.args, env);
  if (name === "read_skill_file") return readSkillFileTool(parsed, env);
  return { ok: false, output: "未知工具: " + name };
}
