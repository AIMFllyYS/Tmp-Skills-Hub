import { AsyncLocalStorage } from "node:async_hooks";

export interface AiConnection {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** A request keeps its own provider and secret, including asynchronous tool calls. */
export const activeConnection = new AsyncLocalStorage<AiConnection | null>();

export interface AiConnectionStorage {
  load(): AiConnection | null;
  save(value: AiConnection | null): void;
}

export function parseConnection(input: unknown, previous: AiConnection | null): AiConnection {
  if (!input || typeof input !== "object") throw new Error("请填写服务地址和模型 ID");
  const fields = input as Record<string, unknown>;
  const model = typeof fields.model === "string" ? fields.model.trim() : "";
  if (!model || model.length > 256 || /\s/.test(model)) throw new Error("请输入服务商提供的完整模型 ID");
  let url: URL;
  try { url = new URL(String(fields.baseUrl)); } catch { throw new Error("请输入完整的服务地址，例如 https://example.com/v1"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) {
    throw new Error("请使用 HTTPS 地址，本机服务也可使用 HTTP。地址中不能包含凭据、查询或片段");
  }
  const baseUrl = url.href.replace(/\/+$/, "");
  const entered = typeof fields.apiKey === "string" ? fields.apiKey.trim() : "";
  const apiKey = entered || (previous?.baseUrl === baseUrl ? previous.apiKey : "");
  if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error("请输入这个服务地址对应的 API Key");
  return { baseUrl, model, apiKey };
}
