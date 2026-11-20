import { afterEach, expect, it, vi } from "vitest";
import { initStore } from "../skills/api.js";
import { acceptDrifted, fetchStoreSettings, loadStoreHealth, migrateStore, patchStoreSettings, pruneDangling } from "./store-operations-api.js";

afterEach(() => vi.unstubAllGlobals());

it("sends only the true source location when initializing a custom store", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
  vi.stubGlobal("fetch", fetch);
  await initStore(" D:\\custom\\skills ");
  await initStore();
  expect(fetch.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])).toEqual([
    ["/api/store/init", { skillsRoot: "D:\\custom\\skills" }],
    ["/api/store/init", {}],
  ]);
});

it("distinguishes migration preview from a confirmed migration and blocks failures", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, dryRun: true, movedLinks: 2, skills: 4 }))
    .mockResolvedValueOnce(Response.json({ ok: false, code: "conflict", message: "目标非空" }, { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  await expect(migrateStore("/tmp/sandbox", true)).resolves.toMatchObject({ movedLinks: 2 });
  await expect(migrateStore("/tmp/sandbox")).rejects.toMatchObject({ code: "conflict", message: "目标非空" });
  expect(fetch.mock.calls.map(([url, options]) => [url, JSON.parse(options.body)])).toEqual([
    ["/api/store/migrate", { targetSkillsRoot: "/tmp/sandbox", dryRun: true }],
    ["/api/store/migrate", { targetSkillsRoot: "/tmp/sandbox", dryRun: false }],
  ]);
});

it("loads true stale-ledger counts and sends only confirmed drift names", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, count: 2 }))
    .mockResolvedValueOnce(Response.json({ ok: true, drifted: [{ name: "sample" }] }))
    .mockResolvedValueOnce(Response.json({ ok: true, count: 2 }))
    .mockResolvedValueOnce(Response.json({ ok: true, count: 1, missing: [] }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  await expect(loadStoreHealth(signal)).resolves.toEqual({ danglingCount: 2, driftedSkills: ["sample"] });
  await pruneDangling();
  await acceptDrifted(["sample"]);
  expect(fetch.mock.calls.map(([url, options]) => [url, options.body === undefined ? null : JSON.parse(options.body)])).toEqual([
    ["/api/doctor/prune", { dryRun: true }],
    ["/api/verify", null],
    ["/api/doctor/prune", { dryRun: false }],
    ["/api/verify/accept", { names: ["sample"] }],
  ]);
  expect(fetch.mock.calls[0]?.[1].signal).toBe(signal);
});

it("reads settings and updates only the chosen desktop preference", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ ok: true, autoLaunch: true })));
  vi.stubGlobal("fetch", fetch);
  await fetchStoreSettings();
  await patchStoreSettings({ silentTray: false });
  expect(fetch.mock.calls).toEqual([
    ["/api/settings", {}],
    ["/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"silentTray":false}' }],
  ]);
});
