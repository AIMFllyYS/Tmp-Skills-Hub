/**
 * Agent 模型白名单(agent-v0.md §6)。ID 以七牛云 /v1/models 实际返回为准
 * (2026-08-22 核实);不在白名单的 model 参数一律回落默认模型。
 */

export interface AgentModel {
  id: string;
  label: string;
  note: string;
  /** 是否支持七牛 enable_thinking(深度思考);不支持时服务端忽略 thinking 请求。 */
  thinking: boolean;
}

export const DEFAULT_AGENT_MODEL = "deepseek/deepseek-v4-flash-20260731";

export const AGENT_MODELS: AgentModel[] = [
  { id: DEFAULT_AGENT_MODEL, label: "DeepSeek V4 Flash", note: "默认 · 快速便宜", thinking: true },
  { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", note: "能力最强 · 复杂任务", thinking: true },
  { id: "z-ai/glm-5.3", label: "GLM-5.3", note: "编程/长程任务", thinking: true },
  { id: "minimax/minimax-m3", label: "MiniMax M3", note: "最便宜 · 长上下文", thinking: false },
];

/** 深度思考按模型能力裁剪:只有请求明确为 true 且模型支持时才打开。 */
export function resolveThinking(modelId: string, requested: unknown): boolean {
  return requested === true && AGENT_MODELS.some((m) => m.id === modelId && m.thinking);
}

/** 白名单校验:不在名单(或非字符串)回落默认模型。 */
export function resolveAgentModel(id: unknown): string {
  return typeof id === "string" && AGENT_MODELS.some((m) => m.id === id) ? id : DEFAULT_AGENT_MODEL;
}
