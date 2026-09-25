/** Agent 前端类型(模型白名单 + 写策略 + 消息元信息)。消息形状走 AI SDK UIMessage。 */

import type { UIMessage } from "ai";

export interface AgentModel {
  id: string;
  label: string;
  note: string;
  /** 是否支持深度思考(agent-v0.md §6);旧服务端缺省视为支持。 */
  thinking?: boolean;
}

export type WritePolicy = "ask" | "allow";

/** agent-v0.md §9:start 写 model / thinking,finish 写 usage。 */
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface AgentMetadata {
  model?: string;
  thinking?: boolean;
  usage?: AgentUsage;
}

export type AgentUIMessage = UIMessage<AgentMetadata>;
