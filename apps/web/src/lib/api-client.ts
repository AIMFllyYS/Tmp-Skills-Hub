/**
 * 统一 HTTP JSON 请求封装:解析 { ok, code, message } 信封并保留结构化 code。
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string, readonly payload?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  fallbackCode?: string;
}

interface RawEnvelope {
  ok?: unknown;
  code?: unknown;
  message?: unknown;
}

export function isStoreUnconfiguredError(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.code === "store-not-configured";
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: unknown }).code === "store-not-configured";
  }
  return false;
}

export async function apiRequest<T extends { ok: true }>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const init: RequestInit = {};
  if (options.method !== undefined) init.method = options.method;
  if (options.signal !== undefined) init.signal = options.signal;
  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, init);
  const parsed = (await res.json().catch(() => null)) as RawEnvelope | null;
  if (!res.ok || parsed === null || parsed.ok !== true) {
    const message =
      parsed !== null && typeof parsed.message === "string" && parsed.message !== ""
        ? parsed.message
        : "HTTP " + String(res.status);
    const code =
      parsed !== null && typeof parsed.code === "string" && parsed.code !== ""
        ? parsed.code
        : options.fallbackCode;
    throw new ApiRequestError(message, res.status, code, parsed);
  }
  return parsed as unknown as T;
}
