/**
 * Agent 消息元信息(agent-v0.md §9):start 写模型与思考开关,finish 写 token 用量。
 * 前端 useChat 会把两次写入合并到同一条助手消息的 metadata 上。
 */

import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface AgentMessageMetadata {
  model?: string;
  thinking?: boolean;
  usage?: AgentUsage;
}

/** 只挑数字字段,供应商缺报的保持缺省,不填 0 冒充。 */
export function pickUsage(usage: LanguageModelUsage | undefined): AgentUsage | undefined {
  if (usage === undefined) return undefined;
  const out: AgentUsage = {};
  if (typeof usage.inputTokens === "number") out.inputTokens = usage.inputTokens;
  if (typeof usage.outputTokens === "number") out.outputTokens = usage.outputTokens;
  const reasoning = usage.outputTokenDetails?.reasoningTokens;
  if (typeof reasoning === "number") out.reasoningTokens = reasoning;
  if (typeof usage.totalTokens === "number") out.totalTokens = usage.totalTokens;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function agentMessageMetadata(base: { model: string; thinking: boolean }) {
  return ({ part }: { part: TextStreamPart<ToolSet> }): AgentMessageMetadata | undefined => {
    if (part.type === "start") return { model: base.model, thinking: base.thinking };
    if (part.type === "finish") {
      const usage = pickUsage(part.totalUsage);
      return usage === undefined ? undefined : { usage };
    }
    return undefined;
  };
}
