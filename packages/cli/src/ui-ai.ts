import type { Hono } from "hono";
import { AGENT_MODELS } from "./agent/models.js";
import { activeConnection, parseConnection, type AiConnectionStorage } from "./llm/connection.js";
import { DEFAULT_QINIU_BASE_URL, llmBaseUrl, qiniuApiKey, resolveModel } from "./llm/provider.js";
import { err } from "./ui-http.js";

function displayBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return ""; }
}

export function registerAiConnection(app: Hono, storage?: AiConnectionStorage): void {
  let custom = storage?.load() ?? null;
  const snapshot = () => ({
    ok: true, mode: custom ? "custom" : "environment", persistent: !!storage,
    baseUrl: custom?.baseUrl ?? displayBaseUrl(llmBaseUrl()), model: custom?.model ?? resolveModel(),
    hasKey: Boolean(custom?.apiKey ?? qiniuApiKey()),
  });

  app.get("/api/settings/ai", c => c.json(snapshot()));
  app.put("/api/settings/ai", async c => {
    const input: unknown = await c.req.json().catch(() => null);
    if (!input || typeof input !== "object" || !("mode" in input)) return err(c, "ai-settings", "bad-usage", "请选择连接方式");
    let next = null;
    if (input.mode === "custom") {
      try { next = parseConnection(input, custom); }
      catch (error) { return err(c, "ai-settings", "bad-usage", (error as Error).message); }
    } else if (input.mode !== "environment") return err(c, "ai-settings", "bad-usage", "未知连接方式");
    storage?.save(next);
    custom = next;
    return c.json(snapshot());
  });
  app.use("/api/*", (_, next) => activeConnection.run(custom, next));
}

export function availableModels() {
  const model = resolveModel();
  const preset = !activeConnection.getStore() && llmBaseUrl() === DEFAULT_QINIU_BASE_URL;
  const models = preset ? [...AGENT_MODELS] : [];
  if (!models.some(item => item.id === model)) models.unshift({ id: model, label: model, note: "当前配置" });
  return { defaultModel: model, models };
}
