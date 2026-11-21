import { afterEach, expect, it, vi } from "vitest";
import { createUiApp } from "../src/ui-server.js";
import { AI_PROVIDERS, environmentConnection } from "../src/llm/presets.js";
import { scrub } from "../src/llm/errors.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(AI_PROVIDERS)("routes $label using only its own environment and credentials", p => {
  const selected = environmentConnection({ SKILLS_HUB_AI_PROVIDER: p.id, [p.env + "_API_KEY"]: "fixture", [p.env + "_MODEL"]: "chosen" });
  expect(selected).toMatchObject({ apiKey: "fixture", baseUrl: p.baseUrl, model: "chosen" });
  vi.stubEnv(p.env + "_API_KEY", "private-test-key");
  expect(scrub("token: private-test-key")).not.toContain("private-test-key");
});

it("never borrows a different provider's credential for a missing or unknown selection", () => {
  expect(environmentConnection({ SKILLS_HUB_AI_PROVIDER: "openrouter", DEEPSEEK_API_KEY: "fixture" }).apiKey).toBe("");
  expect(environmentConnection({ SKILLS_HUB_AI_PROVIDER: "typo", OPENAI_API_KEY: "fixture" }).provider).toBeNull();
  expect(environmentConnection({ OPENROUTER_API_KEY: "fixture", DEEPSEEK_BASE_URL: "https://wrong.test" }).baseUrl).toBe("https://openrouter.ai/api/v1");
});

it.each(AI_PROVIDERS)("loads an unsaved $label model catalog without changing the active selection", async p => {
  const app = createUiApp();
  const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: "b" }, { id: "a" }, { id: "a" }] }));
  vi.stubGlobal("fetch", fetch);
  const res = await app.request("/api/settings/ai/models", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "custom", baseUrl: p.baseUrl, apiKey: "private-test-key" }) });
  expect(await res.json()).toEqual({ ok: true, models: ["a", "b"] });
  expect(fetch).toHaveBeenCalledWith(p.baseUrl + "/models", expect.objectContaining({ headers: { Authorization: "Bearer private-test-key" }, redirect: "error" }));
  expect(await (await app.request("/api/settings/ai")).json()).toMatchObject({ mode: "environment", hasKey: false });
});
