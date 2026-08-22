/** Agent HTTP 客户端:模型白名单 GET + 对话 SSE 流。 */

import { postSse, type SseHandlers } from "../../lib/sse.js";
import type { AgentModel, WireMessage } from "./types.js";

interface AgentModelsResponse {
  ok: true;
  command: "agent-models";
  defaultModel: string;
  models: AgentModel[];
}

export async function fetchAgentModels(): Promise<{ defaultModel: string; models: AgentModel[] }> {
  const res = await fetch("/api/agent/models");
  if (!res.ok) throw new Error("GET /api/agent/models → " + res.status);
  const body = (await res.json()) as AgentModelsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return { defaultModel: body.defaultModel, models: body.models };
}

export interface AgentChatBody {
  messages: WireMessage[];
  model: string;
}

/** 转发给共用 SSE 消费器;事件契约见 agent-v0.md §4。 */
export function streamAgentChat(body: AgentChatBody, handlers: SseHandlers, signal: AbortSignal): Promise<void> {
  return postSse("/api/agent/chat", body, handlers, signal);
}
