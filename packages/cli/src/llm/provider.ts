/**
 * OpenAI 兼容的推理入口。请求级连接优先于本地环境配置。
 */

import { AI_PROVIDERS, environmentConnection } from "./presets.js";
import { activeConnection } from "./connection.js";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const DEFAULT_QINIU_BASE_URL = "https://api.qnaigc.com/v1";
export const DEFAULT_MODEL = AI_PROVIDERS[0].model;
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

export function aiApiKey(): string | undefined {
  const key = activeConnection.getStore()?.apiKey ?? environmentConnection().apiKey;
  return key === undefined || key === "" ? undefined : key;
}

export function llmBaseUrl(): string {
  return (activeConnection.getStore()?.baseUrl ?? environmentConnection().baseUrl).replace(/\/$/, "");
}

/** 显式模型优先，否则使用当前连接的模型。 */
export function resolveModel(explicit?: string): string {
  if (explicit !== undefined && explicit !== "") return explicit;
  const env = activeConnection.getStore()?.model ?? environmentConnection().model;
  return env !== undefined && env !== "" ? env : DEFAULT_MODEL;
}

export function notConfiguredMessage(): string {
  return "请在「设置 → AI 连接」选择服务商并填写 API Key，或设置对应的本地环境变量。";
}

/** 给请求体补 enable_thinking:false(七牛思考开关)。导出供单测。 */
export function injectThinkingOff(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, enable_thinking: false };
}

export interface AiModelOptions {
  fetch?: typeof fetch;
}

/**
 * 已配置密钥时才能调用。调用方先查 aiApiKey()。
 */
export function createAiModel(modelId: string, opts: AiModelOptions = {}): LanguageModel {
  const apiKey = aiApiKey();
  if (apiKey === undefined) {
    throw new Error(notConfiguredMessage());
  }
  const settings: Parameters<typeof createOpenAICompatible>[0] = {
    name: AI_PROVIDERS.find(p => p.baseUrl === llmBaseUrl())?.id ?? "custom",
    baseURL: llmBaseUrl(),
    apiKey,
    // 七牛云 OpenAI 兼容端点以 json_object 模式为准;配合 prompt 内显式 JSON 约束使用 Output.object
    supportsStructuredOutputs: false,

  };
  if (llmBaseUrl() === DEFAULT_QINIU_BASE_URL) settings.transformRequestBody = (body) => injectThinkingOff(body as Record<string, unknown>);
  if (llmBaseUrl() === AI_PROVIDERS[0].baseUrl) settings.transformRequestBody = (body) => ({ ...body, thinking: { type: "disabled" } });
  if (opts.fetch !== undefined) settings.fetch = opts.fetch;
  return createOpenAICompatible(settings).chatModel(modelId);
}
