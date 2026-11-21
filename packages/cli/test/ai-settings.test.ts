import { afterEach, expect, it, vi } from "vitest";
import { createUiApp } from "../src/ui-server.js";
import type { AiConnection } from "../src/llm/connection.js";

afterEach(() => vi.unstubAllEnvs());

it("requires an explicit choice if a previously saved key is unreadable", async () => {
  vi.stubEnv("QINIU_API_KEY", "environment-fixture");
  const app = createUiApp({ aiStorage: { load: () => { throw new Error("unreadable"); }, save: () => undefined } });
  expect(await (await app.request("/api/settings/ai")).json()).toMatchObject({ mode: "custom", hasKey: false, warning: expect.any(String) });
  const chat = await app.request("/api/agent/chat", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [] }),
  });
  expect(chat.status).toBe(503);
});

it("keeps credentials private and scoped to the selected endpoint and local server", async () => {
  vi.stubEnv("QINIU_API_KEY", "environment-test-key");
  vi.stubEnv("QINIU_MODEL", "environment-model");
  let stored: AiConnection | null = null;
  const storage = { load: () => stored, save: (value: AiConnection | null) => { stored = value; } };
  const app = createUiApp({ aiStorage: storage });
  const update = (body: object) => app.request("/api/settings/ai", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const profile = { mode: "custom", baseUrl: "http://127.0.0.1:9854/v1", model: "my-model" };
  expect((await update(profile)).status).toBe(400);
  const saved = await update({ ...profile, apiKey: "private-test-key" });
  expect(await saved.json()).toEqual({ ok: true, mode: "custom", baseUrl: profile.baseUrl, model: "my-model", persistent: true, hasKey: true });
  expect((await update({ ...profile, model: "another-model" })).status).toBe(200);
  expect((await update({ ...profile, baseUrl: "https://example.test/v1" })).status).toBe(400);
  const restarted = createUiApp({ aiStorage: storage });
  expect(await (await restarted.request("/api/agent/models")).json()).toMatchObject({ defaultModel: "another-model", models: [{ id: "another-model" }] });
  expect(await (await createUiApp().request("/api/agent/models")).json()).toMatchObject({ defaultModel: "environment-model" });
  expect(await (await update({ mode: "environment" })).json()).toMatchObject({ mode: "environment", model: "environment-model", hasKey: true });
  expect(stored).toBeNull();
});
