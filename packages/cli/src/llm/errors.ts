/**
 * 把 AI SDK / 网络异常收成 ai-integration-v1 的失败分类。
 * 返回的 message 绝不含密钥。
 */

import {
  APICallError,
  JSONParseError,
  NoObjectGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";

export type LlmFailureCode =
  | "not-configured"
  | "timeout"
  | "aborted"
  | "network"
  | "api"
  | "invalid-response";

const ERROR_HINTS: Record<number, string> = {
  400: "请求格式错误(按提示修正请求体)",
  401: "认证失败(检查 QINIU_API_KEY)",
  402: "账户余额不足",
  422: "请求参数无效",
  429: "请求过于频繁(限流),请稍后重试",
  500: "七牛云服务端错误,请稍后重试",
  503: "七牛云服务过载,请稍后重试",
};

/** 脱敏:遮罩 sk-* 与进程环境中的真实密钥(长度 >= 8)。 */
export function scrub(text: string): string {
  let out = text;
  for (const envKey of ["QINIU_API_KEY", "GITHUB_TOKEN"] as const) {
    const secret = process.env[envKey];
    if (secret !== undefined && secret.length >= 8 && out.includes(secret)) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

function unwrapRetry(e: unknown): unknown {
  let cur: unknown = e;
  while (RetryError.isInstance(cur)) {
    if (cur.lastError !== undefined) {
      cur = cur.lastError;
    } else if (cur.errors.length > 0) {
      cur = cur.errors[cur.errors.length - 1];
    } else {
      break;
    }
  }
  return cur;
}

export function mapLlmError(e: unknown): { code: LlmFailureCode; message: string } {
  const err = unwrapRetry(e);
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 401) {
      return { code: "api", message: "AI 调用失败: " + ERROR_HINTS[401] };
    }
    const hint = status !== undefined ? ERROR_HINTS[status] : undefined;
    return { code: "api", message: "AI 调用失败: " + (hint ?? "七牛云返回 HTTP " + String(status ?? "未知")) };
  }
  if (NoObjectGeneratedError.isInstance(err) || JSONParseError.isInstance(err) || TypeValidationError.isInstance(err)) {
    return { code: "invalid-response", message: "AI 返回格式无效,无法解析为预期结构,请重试" };
  }
  if (err instanceof Error) {
    const name = err.name;
    const msg = err.message.toLowerCase();
    if (name === "TimeoutError" || msg.includes("timeout") || msg.includes("timed out")) {
      return { code: "timeout", message: "AI 调用超时,请稍后重试" };
    }
    if (name === "AbortError" || msg.includes("aborted")) {
      return { code: "aborted", message: "请求已中止" };
    }
    return { code: "network", message: "无法连接 AI 服务: " + scrub(err.message) };
  }
  return { code: "network", message: "无法连接 AI 服务" };
}
