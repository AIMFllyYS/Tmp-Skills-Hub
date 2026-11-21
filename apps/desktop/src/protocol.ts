import { startUiServer, type AiConnectionStorage, type DesktopPreferences, type UiServerHandle } from "@skills-hub/cli";

export const APP_SCHEME = "app";
export const APP_HOST = "skills-hub";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/`;

export type DesktopTransportMode = "protocol" | "http";

export interface FetchableApp {
  fetch: (req: Request) => Promise<Response> | Response;
}

export interface DesktopHttpTransportOptions {
  aiStorage?: AiConnectionStorage | undefined;
  home: string;
  webRoot: string;
  onDesktopPreferences?: (preferences: DesktopPreferences) => void;
}

interface DuplexRequestInit extends RequestInit {
  duplex?: "half";
}

function forbiddenJson(message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, command: "security", code: "forbidden", message }),
    { status: 403, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

/** 根据环境变量解析桌面端传输层模式：默认走自定义 app:// 协议，设为 http 时回落本地 127.0.0.1 服务。 */
export function resolveDesktopTransport(env: NodeJS.ProcessEnv = process.env): DesktopTransportMode {
  return env.SKILLSHUB_DESKTOP_TRANSPORT?.trim().toLowerCase() === "http" ? "http" : "protocol";
}

/** HTTP 回落模式：以 port: 0 在 127.0.0.1 启动进程内 Hono 服务。 */
export async function startDesktopHttpTransport(opts: DesktopHttpTransportOptions): Promise<UiServerHandle> {
  return startUiServer({
    port: 0,
    aiStorage: opts.aiStorage,
    desktop: true,
    home: opts.home,
    webRoot: opts.webRoot,
    ...(opts.onDesktopPreferences === undefined ? {} : { onDesktopPreferences: opts.onDesktopPreferences }),
  });
}

/**
 * 将 Electron 自定义 `app://skills-hub/*` 协议请求桥接到 Hono 应用的 `fetch()`。
 * 在未携带 Host 或目标为 `app://skills-hub` 时补全 `host: skills-hub`，同时完整透传
 * `origin`、`content-type`、method、body 与 `signal`，由 CLI 安全中间件统一执行本地校验。
 */
export function createAppProtocolHandler(
  honoApp: FetchableApp,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    let url: URL;
    try {
      url = new URL(req.url);
    } catch {
      return forbiddenJson("拒绝访问:非法请求 URL");
    }

    if (url.protocol !== `${APP_SCHEME}:`) {
      return forbiddenJson("拒绝访问:仅支持 app:// 协议");
    }

    if (url.host.toLowerCase() !== APP_HOST && !url.pathname.startsWith("/api/")) {
      return forbiddenJson("拒绝访问:Host 不在本地白名单");
    }

    const headers = new Headers(req.headers);
    const existingHost = headers.get("host");
    if (existingHost === null || existingHost.trim() === "") {
      if (url.host.toLowerCase() === APP_HOST) {
        headers.set("host", APP_HOST);
      } else if (url.host !== "") {
        headers.set("host", url.host);
      }
    }

    const method = req.method.toUpperCase();
    const init: DuplexRequestInit = {
      method,
      headers,
    };
    if (req.signal !== undefined) {
      init.signal = req.signal;
    }
    if (req.body !== null && method !== "GET" && method !== "HEAD") {
      init.body = req.body;
      init.duplex = "half";
    }

    const targetUrl = `http://${url.host}${url.pathname}${url.search}`;
    return await honoApp.fetch(new Request(targetUrl, init));
  };
}
