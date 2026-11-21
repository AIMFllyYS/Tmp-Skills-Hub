import { AI_PROVIDERS, environmentConnection } from "./llm/presets.js";
import { probeConnection } from "./llm/probe.js";
import { mapLlmError } from "./llm/errors.js";
import type { Hono } from "hono";
import { AGENT_MODELS } from "./agent/models.js";
import { activeConnection, parseConnection, type AiConnectionStorage } from "./llm/connection.js";
import { DEFAULT_QINIU_BASE_URL, llmBaseUrl, aiApiKey, resolveModel } from "./llm/provider.js";
import { err } from "./ui-http.js";

function displayBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return ""; }
}

export function registerAiConnection(app: Hono, storage?: AiConnectionStorage): void {
  let custom: ReturnType<AiConnectionStorage["load"]> = null;
  let warning: string | undefined;
  try { custom = storage?.load() ?? null; }
  catch {
    // Require an explicit choice before sending data to a different provider.
    custom = { baseUrl: "", model: "", apiKey: "" };
    warning = "无法解密上次保存的连接。请重新填写，或选择环境变量后保存。";
  }
  const snapshot = () => ({
    ok: true, mode: custom ? "custom" : "environment", persistent: !!storage,
    baseUrl: custom?.baseUrl ?? displayBaseUrl(llmBaseUrl()), model: custom?.model ?? resolveModel(),
    hasKey: Boolean(custom?.apiKey ?? aiApiKey()), ...(warning ? { warning } : {}),
  });

  app.get("/api/settings/ai/providers", c => c.json({ ok: true, providers: AI_PROVIDERS, environment: environmentConnection().provider?.id ?? null }));
  app.get("/api/settings/ai", c => c.json(snapshot()));
  app.post("/api/settings/ai/:operation", async c => {
    const operation = c.req.param("operation");
    if (operation !== "models" && operation !== "test") return err(c, "ai-settings", "not-found", "未知操作");
    const raw: unknown = await c.req.json().catch(() => null);
    if (!raw || typeof raw !== "object" || !("mode" in raw)) return err(c, "ai-settings", "bad-usage", "请选择配置来源");
    let connection;
    if (raw.mode === "environment") connection = environmentConnection();
    else if (raw.mode === "custom") {
      try { connection = parseConnection(operation === "models" ? { ...raw, model: "catalog" } : raw, custom); }
      catch (e) { return err(c, "ai-settings", "bad-usage", (e as Error).message); }
    } else return err(c, "ai-settings", "bad-usage", "未知连接方式");
    if (!connection.apiKey) return err(c, "ai-settings", "not-configured", "当前服务尚未配置密钥。");
    try { return c.json({ ok: true, ...await probeConnection(connection, operation, c.req.raw.signal) }); }
    catch (error) {
      const safe = activeConnection.run(connection, () => mapLlmError(error));
      return err(c, "ai-settings", safe.code, safe.message, 502);
    }
  });
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
    warning = undefined;
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
