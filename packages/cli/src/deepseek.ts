/**
 * DeepSeek 调用封装(#42)。依据官方文档(2026-08 查证):
 * - 端点:POST https://api.deepseek.com/chat/completions(OpenAI 兼容格式)
 * - 认证:Authorization: Bearer <DEEPSEEK_API_KEY>
 * - 模型:deepseek-v4-flash / deepseek-v4-pro(官方文档现行名)
 * - 错误码:400 格式 / 401 认证 / 402 余额 / 422 参数 / 429 限流 / 500|503 服务端
 * 来源:https://api-docs.deepseek.com/api/create-chat-completion/
 *      https://api-docs.deepseek.com/quick_start/error_codes
 *
 * 硬约束:密钥只从环境变量读取(或显式注入),绝不写入日志、源码、
 * 或任何发往前端的响应;未配置密钥时返回可读提示,不崩溃不静默。
 */

export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type DeepSeekFailureCode = "not-configured" | "timeout" | "network" | "api";

export type DeepSeekResult =
  | { ok: true; content: string }
  | { ok: false; code: DeepSeekFailureCode; message: string };

export interface ChatOptions {
  /** 显式注入(测试用);缺省读 DEEPSEEK_API_KEY 环境变量 */
  apiKey?: string;
  /** 超时毫秒,缺省 30s(不无限挂起) */
  timeoutMs?: number;
  /** fetch 替身(测试隔离真实网络) */
  fetchImpl?: typeof fetch;
}

const ERROR_HINTS: Record<number, string> = {
  400: "请求格式错误(按提示修正请求体)",
  401: "认证失败(检查 DEEPSEEK_API_KEY)",
  402: "账户余额不足",
  422: "请求参数无效",
  429: "请求过于频繁(限流),请稍后重试",
  500: "DeepSeek 服务端错误,请稍后重试",
  503: "DeepSeek 服务过载,请稍后重试",
};

/** 单轮对话补全(非流式)。密钥绝不进入返回的 message。 */
export async function chatCompletion(
  messages: DeepSeekMessage[],
  opts: ChatOptions = {},
): Promise<DeepSeekResult> {
  const apiKey = opts.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return { ok: false, code: "not-configured", message: "未配置 DEEPSEEK_API_KEY:请在 .env 中填写后重试(功能不可用但不崩溃)。" };
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetchImpl(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash", messages, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const hint = ERROR_HINTS[res.status] ?? "DeepSeek 返回 HTTP " + res.status;
      return { ok: false, code: "api", message: "DeepSeek 调用失败: " + hint };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content === "") {
      return { ok: false, code: "api", message: "DeepSeek 响应结构异常(缺少 choices[0].message.content)" };
    }
    return { ok: true, content };
  } catch (e) {
    if (controller.signal.aborted) {
      return { ok: false, code: "timeout", message: "DeepSeek 调用超时(30s),请稍后重试" };
    }
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "network", message: "无法连接 DeepSeek: " + reason };
  } finally {
    clearTimeout(timer);
  }
}
