import { generateText } from "ai";
import { activeConnection, type AiConnection } from "./connection.js";
import { createAiModel, resolveModel } from "./provider.js";

export async function probeConnection(connection: AiConnection, operation: "models" | "test", signal: AbortSignal) {
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
  if (operation === "models") {
    const response = await fetch(connection.baseUrl + "/models", {
      headers: { Authorization: "Bearer " + connection.apiKey }, redirect: "error", signal: timeout,
    });
    if (!response.ok) throw new Error("模型列表请求失败（HTTP " + response.status + "）。仍可手动填写模型 ID。");
    const data = await response.json() as { data?: { id?: unknown }[] };
    const ids = Array.isArray(data.data) ? data.data.flatMap(m => typeof m?.id === "string" && m.id.length <= 256 ? [m.id] : []) : [];
    if (!ids.length) throw new Error("服务未返回可选模型，请手动填写模型 ID。");
    return { models: [...new Set(ids)].sort() };
  }
  const reply = await activeConnection.run(connection, () => generateText({
    model: createAiModel(resolveModel()), prompt: "Reply with OK.", maxOutputTokens: 32, maxRetries: 0, abortSignal: timeout,
  }));
  if (!reply.text.trim()) throw new Error("连接成功，但模型未返回文本。请检查模型 ID。");
  return { model: connection.model };
}
