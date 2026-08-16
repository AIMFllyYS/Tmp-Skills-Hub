import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { scanKnownClients } from "./scan.js";

export const DEFAULT_UI_PORT = 4321;

/**
 * 本地查看服务:App 壳(apps/web)的数据源。
 * 只读、只服务 localhost;正式版还会托管 web 的静态构建产物(M2)。
 */
export function createUiApp(): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/skills", async (c) => {
    const skills = await scanKnownClients();
    return c.json({
      skills: skills.map((s) => ({
        hash: s.hash,
        name: s.meta.name,
        description: s.meta.description,
        source: s.clientId,
      })),
    });
  });

  return app;
}

export function startUiServer(port = DEFAULT_UI_PORT): void {
  serve({ fetch: createUiApp().fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log(`skill-hub ui: http://127.0.0.1:${info.port}/api/skills`);
  });
}
