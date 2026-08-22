/**
 * 七牛云 AI 推理服务调用封装(ai-integration-v1.md)。OpenAI 兼容:
 * - 端点:POST {QINIU_BASE_URL:-https://api.qnaigc.com/v1}/chat/completions
 * - 认证:Authorization: Bearer <QINIU_API_KEY>
 * - 参数:一律 enable_thinking:false(直接输出,不深度思考);
 *   翻译与 Agent 走流式(stream:true),分析走非流式。
 *
 * 硬约束:密钥只从环境变量读取(或显式注入),绝不写入日志、源码、
 * 或任何发往前端的响应;未配置密钥时返回可读提示,不崩溃不静默。
 */

export const DEFAULT_QINIU_BASE_URL = "https://api.qnaigc.com/v1";
export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-20260731";

/** 补全端点;QINIU_BASE_URL 可覆盖基地址(尾斜杠容忍)。 */
export function llmEndpoint(): string {
  const base = process.env.QINIU_BASE_URL ?? DEFAULT_QINIU_BASE_URL;
  return base.replace(/\/$/, "") + "/chat/completions";
}

/** 缺省模型:opts.model > QINIU_MODEL 环境变量 > DEFAULT_MODEL。 */
export function resolveModel(explicit: string | undefined): string {
  if (explicit !== undefined && explicit !== "") return explicit;
  const env = process.env.QINIU_MODEL;
  return env !== undefined && env !== "" ? env : DEFAULT_MODEL;
}

/** 工具调用(OpenAI function calling 形状)。 */
export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** 对话消息(OpenAI 兼容子集;tool 角色用于 Agent 工具回传)。 */
export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

/** 工具定义(传给请求体 tools)。 */
export interface LlmToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type LlmFailureCode = "not-configured" | "timeout" | "network" | "api";

export type LlmResult =
  | { ok: true; content: string }
  | { ok: false; code: LlmFailureCode; message: string };

export interface ChatOptions {
  /** 显式注入(测试用);缺省读 QINIU_API_KEY 环境变量 */
  apiKey?: string;
  /** 非流式总超时毫秒,缺省 30s(流式不用它,走空闲超时) */
  timeoutMs?: number;
  /** fetch 替身(测试隔离真实网络) */
  fetchImpl?: typeof fetch;
  /** 模型;缺省 QINIU_MODEL 环境变量,再缺省 DEFAULT_MODEL */
  model?: string;
  /** 工具定义(Agent);有值时附进请求体 */
  tools?: LlmToolDef[];
  /** 上游中止(如客户端断开) */
  signal?: AbortSignal;
}

const ERROR_HINTS: Record<number, string> = {
  400: "请求格式错误(按提示修正请求体)",
  401: "认证失败(检查 QINIU_API_KEY)",
  402: "账户余额不足",
  422: "请求参数无效",
  429: "请求过于频繁(限流),请稍后重试",
  500: "七牛云服务端错误,请稍后重试",
  503: "七牛云服务过载,请稍后重试",
};

function notConfigured(): LlmResult {
  return { ok: false, code: "not-configured", message: "未配置 QINIU_API_KEY:请在 .env 中填写后重试(功能不可用但不崩溃)。" };
}

function apiKeyOf(opts: ChatOptions): string | undefined {
  const key = opts.apiKey ?? process.env.QINIU_API_KEY;
  return key === undefined || key === "" ? undefined : key;
}

function requestBody(model: string, messages: LlmMessage[], stream: boolean, tools: LlmToolDef[] | undefined): string {
  const body: Record<string, unknown> = { model, messages, stream, enable_thinking: false };
  if (tools !== undefined && tools.length > 0) body.tools = tools;
  return JSON.stringify(body);
}

/** 单轮对话补全(非流式,分析用)。密钥绝不进入返回的 message。 */
export async function chatCompletion(messages: LlmMessage[], opts: ChatOptions = {}): Promise<LlmResult> {
  const apiKey = apiKeyOf(opts);
  if (apiKey === undefined) return notConfigured();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  const onUpstreamAbort = (): void => controller.abort();
  opts.signal?.addEventListener("abort", onUpstreamAbort);
  try {
    const res = await fetchImpl(llmEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: requestBody(resolveModel(opts.model), messages, false, opts.tools),
      signal: controller.signal,
    });
    if (!res.ok) {
      const hint = ERROR_HINTS[res.status] ?? "七牛云返回 HTTP " + res.status;
      return { ok: false, code: "api", message: "AI 调用失败: " + hint };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content === "") {
      return { ok: false, code: "api", message: "AI 响应结构异常(缺少 choices[0].message.content)" };
    }
    return { ok: true, content };
  } catch (e) {
    if (controller.signal.aborted) {
      return { ok: false, code: "timeout", message: "AI 调用超时(" + String((opts.timeoutMs ?? 30_000) / 1000) + "s),请稍后重试" };
    }
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "network", message: "无法连接 AI 服务: " + reason };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onUpstreamAbort);
  }
}

export type LlmStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_calls"; calls: LlmToolCall[] }
  | { type: "done" }
  | { type: "error"; code: LlmFailureCode; message: string };

/** 流式空闲超时:每收到一个 chunk 重置;流式不能用总超时。 */
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

/**
 * 流式对话补全(翻译与 Agent 用)。async generator:
 * - text 事件逐段下发正文增量(reasoning_content 一律忽略)
 * - tool_calls 分片按 index 累积,流结束后一次性完整发出
 * - 任何失败 yield error 后结束;JSON 坏行跳过不中断
 */
export async function* chatCompletionStream(messages: LlmMessage[], opts: ChatOptions = {}): AsyncGenerator<LlmStreamEvent> {
  const apiKey = apiKeyOf(opts);
  if (apiKey === undefined) {
    const r = notConfigured();
    if (!r.ok) yield { type: "error", code: r.code, message: r.message };
    return;
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  let idleTimedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      idleTimedOut = true;
      controller.abort();
    }, STREAM_IDLE_TIMEOUT_MS);
  };
  const onUpstreamAbort = (): void => controller.abort();
  opts.signal?.addEventListener("abort", onUpstreamAbort);
  armIdleTimer();
  try {
    const res = await fetchImpl(llmEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: requestBody(resolveModel(opts.model), messages, true, opts.tools),
      signal: controller.signal,
    });
    if (!res.ok) {
      const hint = ERROR_HINTS[res.status] ?? "七牛云返回 HTTP " + res.status;
      yield { type: "error", code: "api", message: "AI 调用失败: " + hint };
      return;
    }
    const body = res.body;
    if (body === null) {
      yield { type: "error", code: "api", message: "AI 响应结构异常(缺少流式响应体)" };
      return;
    }
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const acc = new Map<number, LlmToolCall>();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      armIdleTimer();
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          buffer = "";
          break;
        }
        let parsed: { choices?: { delta?: { content?: unknown; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
        try {
          parsed = JSON.parse(payload) as typeof parsed;
        } catch {
          continue; // 坏行容错:跳过不中断
        }
        const delta = parsed.choices?.[0]?.delta;
        if (delta === undefined || delta === null) continue;
        if (typeof delta.content === "string" && delta.content !== "") {
          yield { type: "text", delta: delta.content };
        }
        if (delta.tool_calls !== undefined) {
          for (const piece of delta.tool_calls) {
            const index = piece.index ?? 0;
            const slot = acc.get(index) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
            if (piece.id !== undefined && piece.id !== "") slot.id = piece.id;
            if (piece.function?.name !== undefined) slot.function.name += piece.function.name;
            if (piece.function?.arguments !== undefined) slot.function.arguments += piece.function.arguments;
            acc.set(index, slot);
          }
        }
      }
    }
    if (acc.size > 0) {
      const calls = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call).filter((c) => c.function.name !== "");
      if (calls.length > 0) yield { type: "tool_calls", calls };
    }
    yield { type: "done" };
  } catch (e) {
    if (idleTimedOut) {
      yield { type: "error", code: "timeout", message: "AI 流式响应超时(" + String(STREAM_IDLE_TIMEOUT_MS / 1000) + "s 无数据),请稍后重试" };
      return;
    }
    if (opts.signal?.aborted === true) {
      yield { type: "error", code: "network", message: "请求已中止" };
      return;
    }
    const reason = e instanceof Error ? e.message : String(e);
    yield { type: "error", code: "network", message: "无法连接 AI 服务: " + reason };
  } finally {
    if (timer !== null) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onUpstreamAbort);
  }
}
