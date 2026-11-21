import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  adoptSkillFolder,
  applyLinkSet,
  hashSkillFolder,
  readGroups,
  readLinksLedger,
  readStoreIndex,
  readUsageStats,
  type HubPaths,
  type LinkEntry,
  writeGroups,
  writeLinksLedger,
} from "@skills-hub/core";
import { performMigrate } from "../src/store-migrate.js";
import { performInit, POINTER_REL } from "../src/store-shared.js";
import { createUiApp } from "../src/ui-server.js";

let home: string;
let paths: HubPaths;
let sample: string;
const body = "---\nname: demo\ndescription: sandbox\n---\nOriginal.\n";

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-operations-"));
  const init = await performInit(home, { skillsRoot: path.join(home, "custom-assets") });
  if (!init.ok) throw new Error(init.message);
  paths = init.paths;
  sample = path.join(home, "source");
  await mkdir(sample);
  await writeFile(path.join(sample, "SKILL.md"), body);
  await adoptSkillFolder(paths, sample, { kind: "local-scan", reference: sample });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function enable(clientId: string): Promise<LinkEntry> {
  const [skill] = await readStoreIndex(paths);
  const targetDir = path.join(home, "." + clientId, "skills");
  await mkdir(targetDir, { recursive: true });
  const entry: LinkEntry = {
    id: clientId + ":global:demo",
    clientId,
    targetDir,
    entryName: "demo",
    skillHash: skill!.hash,
    kind: process.platform === "win32" ? "junction" : "symlink",
    createdAt: "2026-11-20T00:00:00.000Z",
    scope: "global",
  };
  expect(await applyLinkSet(paths, { targetDir, entries: [entry] })).toMatchObject({ ok: true });
  return entry;
}

function request(app: ReturnType<typeof createUiApp>, url: string, method: "POST" | "PATCH" | "PUT", payload: object) {
  return app.request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, [path.resolve("dist/index.js"), ...args, "--home", home, "--json"], {
    encoding: "utf8",
  });
  expect(result.stdout, result.stderr).not.toBe("");
  return { code: result.status, payload: JSON.parse(result.stdout) as unknown };
}

it.runIf(process.platform === "win32")("preserves a locked old folder after changing the active store and client link", async () => {
  const entry = await enable("codex");
  const target = path.join(home, "new-folder");
  const holder = spawn(process.execPath, ["-e", "process.stdin.resume()"], { cwd: paths.skillsRoot, stdio: ["pipe", "ignore", "ignore"] });
  await once(holder, "spawn");
  try {
    const result = await performMigrate({ paths, home, targetSkillsRoot: target, dryRun: false });
    expect(result).toMatchObject({ ok: true, aside: paths.skillsRoot });
    expect(JSON.parse(await readFile(path.join(home, POINTER_REL), "utf8"))).toMatchObject({ skillsRoot: await realpath(target) });
    expect(await realpath(path.join(entry.targetDir, "demo"))).toBe(await realpath(path.join(target, "demo")));
    expect(await readFile(path.join(paths.skillsRoot, "demo", "SKILL.md"), "utf8")).toBe(body);
  } finally {
    const closed = once(holder, "close");
    holder.stdin.end();
    await closed;
  }
});

it("initializes an independent skills root over HTTP and preserves config preferences across re-init", async () => {
  const fakeHome = path.join(home, "other-home");
  const app = createUiApp({ home: fakeHome, desktop: true });
  const custom = path.join(fakeHome, "another-root");
  expect((await app.request("/api/settings")).status).toBe(503);
  const init = await request(app, "/api/store/init", "POST", { skillsRoot: custom });
  expect(init.status).toBe(200);
  const canonical = await realpath(custom);
  expect(await init.json()).toMatchObject({ skillsRoot: canonical, stateRoot: path.join(fakeHome, ".skills-hub"), layoutMode: "split" });
  const patch = await request(app, "/api/settings", "PATCH", { autoLaunch: true, silentTray: true, gitEnabled: true });
  expect(patch.status).toBe(200);
  expect(await patch.json()).toMatchObject({ autoLaunch: true, silentTray: true, git: { enabled: true }, isDesktop: true });
  expect((await request(app, "/api/settings", "PATCH", { skillsRoot: paths.skillsRoot })).status).toBe(400);
  expect((await request(app, "/api/store/init", "POST", {})).status).toBe(200);
  expect((await request(app, "/api/store/init", "POST", { skillsRoot: custom })).status).toBe(200);
  const settings = await app.request("/api/settings");
  expect(await settings.json()).toMatchObject({ skillsRoot: canonical, git: { enabled: true }, autoLaunch: true, stateDiskBytes: expect.any(Number) });
  expect((await request(app, "/api/store/init", "POST", { skillsRoot: paths.skillsRoot })).status).toBe(400);
});

it("applies and persists desktop preferences in order, leaving browser settings read-only to Electron", async () => {
  const onDesktopPreferences = vi.fn();
  const desktop = createUiApp({ home, paths, desktop: true, onDesktopPreferences });
  const browser = createUiApp({ home, paths, onDesktopPreferences });
  expect(await (await browser.request("/api/settings")).json()).toMatchObject({ isDesktop: false });
  const [autostart, retention] = await Promise.all([
    request(desktop, "/api/settings", "PATCH", { autoLaunch: true }),
    request(desktop, "/api/settings", "PATCH", { silentTray: true }),
  ]);
  expect(autostart.status).toBe(200);
  expect(retention.status).toBe(200);
  expect(onDesktopPreferences.mock.calls).toEqual([
    [{ autoLaunch: true, silentTray: false }], [{ autoLaunch: true, silentTray: true }],
  ]);
  onDesktopPreferences.mockImplementationOnce(() => { throw new Error("simulated OS rejection"); });
  expect((await request(desktop, "/api/settings", "PATCH", { autoLaunch: false })).status).toBe(500);
  expect(await (await desktop.request("/api/settings")).json()).toMatchObject({
    autoLaunch: true, silentTray: true, isDesktop: true,
  });
});

it("migrates through HTTP, updates running content routes and preserves the source directory", async () => {
  const entry = await enable("claude");
  const app = createUiApp({ home, paths });
  const target = path.join(home, "next-assets");
  await mkdir(target);
  const patch = await request(app, "/api/settings", "PATCH", { silentTray: true });
  expect(patch.status).toBe(200);
  expect((await request(app, "/api/store/migrate", "POST", { targetSkillsRoot: entry.targetDir })).status).toBe(400);
  const dry = await request(app, "/api/store/migrate", "POST", { targetSkillsRoot: target, dryRun: true });
  expect(await dry.json()).toMatchObject({ dryRun: true, movedLinks: 1 });
  expect(await readdir(target)).toEqual([]);
  const response = await request(app, "/api/store/migrate", "POST", { targetSkillsRoot: target });
  expect(response.status).toBe(200);
  const result = await response.json() as { aside: string; paths: HubPaths };
  const canonical = await realpath(target);
  expect(result.paths.skillsRoot).toBe(canonical);
  await expect(readFile(path.join(result.aside, "demo", "SKILL.md"), "utf8")).resolves.toBe(body);
  expect(await realpath(path.join(entry.targetDir, "demo"))).toBe(await realpath(path.join(target, "demo")));
  const content = await app.request("/api/skills/demo/file?path=SKILL.md");
  expect(await content.json()).toMatchObject({ ok: true, content: body });
  expect(await (await app.request("/api/settings")).json()).toMatchObject({ skillsRoot: canonical, silentTray: true });
  expect(cli("list").payload).toMatchObject({ total: 1, storeRoot: paths.stateRoot });
});

it("reverses earlier link changes and preserves bytes and config when a later root fails", async () => {
  const entries = [await enable("claude"), await enable("codex")];
  const originalConfig = await readFile(path.join(home, POINTER_REL), "utf8");
  const originalLedger = await readFile(path.join(paths.stateRoot, "links.json"), "utf8");
  const target = path.join(home, "next-assets");
  const result = await performMigrate({
    home, paths, targetSkillsRoot: target,
    switchLinks: (root, plan, opts) => applyLinkSet(root, plan, plan.targetDir === entries[1]!.targetDir ? { ...opts, failAfter: 1 } : opts),
  });
  expect(result).toMatchObject({ ok: false, code: "io-error", message: expect.stringContaining("注入失败") });
  expect(await readFile(path.join(home, POINTER_REL), "utf8")).toBe(originalConfig);
  expect(await readFile(path.join(paths.stateRoot, "links.json"), "utf8")).toBe(originalLedger);
  for (const entry of entries) {
    expect(await realpath(path.join(entry.targetDir, "demo"))).toBe(await realpath(path.join(paths.skillsRoot, "demo")));
  }
  await expect(readFile(path.join(paths.skillsRoot, "demo", "SKILL.md"), "utf8")).resolves.toBe(body);
  expect(await readdir(home)).toContainEqual(expect.stringMatching(/^next-assets\.pre-migrate-failed/));
});

it("previews and accepts drift through CLI and HTTP, updating all four metadata stores", async () => {
  const entry = await enable("claude");
  const groups = await readGroups(paths);
  groups.groups[0]!.memberHashes = [entry.skillHash];
  await writeGroups(paths, groups);
  expect(cli("show", "demo").code).toBe(0);
  const skillDir = path.join(paths.skillsRoot, "demo");
  await writeFile(path.join(skillDir, "SKILL.md"), body + "Update.");
  const actualHash = await hashSkillFolder(skillDir);
  expect(cli("verify", "--accept", "demo", "--dry-run")).toMatchObject({ code: 0, payload: { count: 1, dryRun: true } });
  expect(cli("verify", "--accept")).toMatchObject({ code: 2, payload: { code: "auth-required" } });
  expect((await readStoreIndex(paths))[0]!.hash).toBe(entry.skillHash);
  const app = createUiApp({ paths, home });
  expect((await request(app, "/api/verify/accept", "POST", { names: ["unknown"] })).status).toBe(404);
  const accepted = await request(app, "/api/verify/accept", "POST", { names: ["demo"] });
  expect(await accepted.json()).toMatchObject({ ok: true, count: 1, accepted: [{ name: "demo", actualHash }] });
  expect((await readStoreIndex(paths))[0]!.hash).toBe(actualHash);
  expect((await readGroups(paths)).groups[0]!.memberHashes).toEqual([actualHash]);
  expect((await readLinksLedger(paths))[0]!.skillHash).toBe(actualHash);
  expect((await readUsageStats(paths)).counters[actualHash]?.show).toBe(1);
});

it("prunes only stale ledger rows, with no changes to client directories", async () => {
  const entry = await enable("claude");
  const ghost = { ...entry, id: "ghost", entryName: "ghost" };
  await writeLinksLedger(paths, [entry, ghost]);
  expect(cli("doctor", "--prune", "--dry-run")).toMatchObject({ code: 0, payload: { count: 1, dryRun: true } });
  expect(await readLinksLedger(paths)).toHaveLength(2);
  const app = createUiApp({ home, paths });
  const result = await request(app, "/api/doctor/prune", "POST", {});
  expect(await result.json()).toMatchObject({ ok: true, count: 1, pruned: [{ id: "ghost" }] });
  expect(await readLinksLedger(paths)).toEqual([entry]);
  expect(await readdir(entry.targetDir)).toEqual(["demo"]);
});

it("provides stable JSON from CLI migrate and preserves settings and assets", async () => {
  const target = path.join(home, "moved");
  expect(cli("migrate", "--to", "relative", "--yes")).toMatchObject({ code: 2, payload: { code: "bad-usage" } });
  expect(cli("migrate", "--to", target, "--dry-run")).toMatchObject({ code: 0, payload: { dryRun: true } });
  const migration = cli("migrate", "--to", target, "--yes");
  expect(migration).toMatchObject({ code: 0, payload: { skillsRoot: await realpath(target), skills: 1 } });
  await expect(readFile(path.join(target, "demo", "SKILL.md"), "utf8")).resolves.toBe(body);
});
