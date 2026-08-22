/**
 * Agent 单轮对话循环(agent-v0.md §6):模型流式输出 → 工具调用 → 结果回传,
 * 直到模型不再调工具。服务端无状态;done 事件携带全量 transcript,
 * 前端以此替换本地 wire,避免前端重建 OpenAI 消息出错。
 */

import { chatCompletionStream, type LlmMessage, type LlmToolCall } from "../llm.js";
import { buildAgentSystemPrompt } from "./prompt.js";
import { AGENT_TOOL_DEFS, executeAgentTool, type ToolEnv, type ToolExecResult } from "./tools.js";

/** 单轮请求最多多少次模型调用。 */
export const AGENT_MAX_ROUNDS = 15;

export type AgentSseEvent =
  | { event: "delta"; data: { text: string } }
  | { event: "tool_call"; data: { callId: string; name: string; args: string } }
  | { event: "tool_result"; data: { callId: string; ok: boolean; output: string; durationMs: number } }
  | { event: "done"; data: { messages: LlmMessage[] } }
  | { event: "error"; data: { code: string; message: string } };

export interface AgentTurnOptions {
  /** 前端传来的全量历史(不含 system;system 由本模块注入) */
  messages: LlmMessage[];
  model: string;
  env: ToolEnv;
  /** 注入系统提示词的客户端清单 */
  clients: string[];
  /** 测试注入:流式 chat 替身 */
  chatStream?: typeof chatCompletionStream;
  /** 测试注入:工具执行替身 */
  execTool?: (name: string, args: string, env: ToolEnv) => Promise<ToolExecResult>;
  signal?: AbortSignal;
}

export async function* runAgentTurn(opts: AgentTurnOptions): AsyncGenerator<AgentSseEvent> {
  const chat = opts.chatStream ?? chatCompletionStream;
  const exec = opts.execTool ?? executeAgentTool;
  const transcript: LlmMessage[] = [...opts.messages];
  const system: LlmMessage = {
    role: "system",
    content: buildAgentSystemPrompt({ storeRoot: opts.env.storeRoot ?? "(未配置)", clients: opts.clients }),
  };
  for (let round = 0; round < AGENT_MAX_ROUNDS; round++) {
    let roundText = "";
    let toolCalls: LlmToolCall[] = [];
    const chatOpts: Parameters<typeof chat>[1] = { model: opts.model, tools: AGENT_TOOL_DEFS };
    if (opts.signal !== undefined) chatOpts.signal = opts.signal;
    for await (const ev of chat([system, ...transcript], chatOpts)) {
      if (ev.type === "text") {
        roundText += ev.delta;
        yield { event: "delta", data: { text: ev.delta } };
      } else if (ev.type === "tool_calls") {
        toolCalls = ev.calls;
      } else if (ev.type === "error") {
        yield { event: "error", data: { code: ev.code, message: ev.message } };
        return;
      }
    }
    if (toolCalls.length === 0) {
      transcript.push({ role: "assistant", content: roundText });
      yield { event: "done", data: { messages: transcript } };
      return;
    }
    transcript.push({ role: "assistant", content: roundText === "" ? null : roundText, tool_calls: toolCalls });
    for (const call of toolCalls) {
      yield { event: "tool_call", data: { callId: call.id, name: call.function.name, args: call.function.arguments } };
      const startedAt = Date.now();
      const result = await exec(call.function.name, call.function.arguments, opts.env);
      yield {
        event: "tool_result",
        data: { callId: call.id, ok: result.ok, output: result.output, durationMs: Date.now() - startedAt },
      };
      transcript.push({ role: "tool", tool_call_id: call.id, content: result.output });
    }
  }
  yield { event: "error", data: { code: "agent-loop-limit", message: "已达单轮 " + String(AGENT_MAX_ROUNDS) + " 次模型调用上限,请拆分任务后继续。" } };
}

/**
 * 前端 wire 消息校验(agent-v0.md §5):非数组 / 含 system / 形状不合法一律 null。
 * 宽松收窄:多余字段丢弃,不合法项整体拒绝(防伪造)。
 */
export function parseWireMessages(value: unknown): LlmMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages: LlmMessage[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const raw = item as Record<string, unknown>;
    const role = raw.role;
    if (role !== "user" && role !== "assistant" && role !== "tool") return null;
    const content = raw.content;
    if (!(typeof content === "string" || content === null)) return null;
    const message: LlmMessage = { role, content };
    if (raw.tool_call_id !== undefined) {
      if (typeof raw.tool_call_id !== "string") return null;
      message.tool_call_id = raw.tool_call_id;
    }
    if (raw.tool_calls !== undefined) {
      if (!Array.isArray(raw.tool_calls)) return null;
      const calls: LlmMessage["tool_calls"] = [];
      for (const c of raw.tool_calls) {
        if (typeof c !== "object" || c === null) return null;
        const rc = c as Record<string, unknown>;
        if (typeof rc.id !== "string") return null;
        const fn = rc.function;
        if (typeof fn !== "object" || fn === null) return null;
        const rfn = fn as Record<string, unknown>;
        if (typeof rfn.name !== "string" || typeof rfn.arguments !== "string") return null;
        calls.push({ id: rc.id, type: "function", function: { name: rfn.name, arguments: rfn.arguments } });
      }
      message.tool_calls = calls;
    }
    messages.push(message);
  }
  return messages;
}
