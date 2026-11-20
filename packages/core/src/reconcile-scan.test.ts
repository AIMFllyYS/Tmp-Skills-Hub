import { mkdir, mkdtemp, readFile, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashSkillFolder } from "./hash.js";
import { writeLinksLedger, type LinkEntry } from "./links.js";
import { inspectDriftL2, scanClientDriftL1 } from "./reconcile-scan.js";
import { initializeStoreLayout } from "./store-layout.js";
import type { HubPaths } from "./store-location.js";
import { adoptSkillFolder } from "./store.js";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, readFile: vi.fn(fs.readFile) };
});

let home: string;
let paths: HubPaths;

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "skills-hub-scan-")));
  paths = { layoutMode: "split", stateRoot: path.join(home, ".skills-hub"), skillsRoot: path.join(home, "assets", "skills") };
  await initializeStoreLayout(paths);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  vi.clearAllMocks();
});

function client(name: string): string {
  return path.join(home, "." + name, "skills");
}

async function writeSkill(dir: string, name: string, body: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Sandbox sample\n---\n${body}\n`);
}

function ledger(clientId: string, entryName: string): LinkEntry {
  return {
    id: clientId + ":" + entryName, clientId, entryName, targetDir: client(clientId),
    scope: "global", skillHash: "x", createdAt: "2026-11-20T00:00:00.000Z",
    kind: process.platform === "win32" ? "junction" : "symlink",
  };
}

function link(target: string, location: string): Promise<void> {
  return symlink(target, location, process.platform === "win32" ? "junction" : "dir");
}

it("classifies six L1 kinds without opening a skill file", async () => {
  const root = client("codex");
  await mkdir(root, { recursive: true });
  const canonical = path.join(paths.skillsRoot, "managed");
  const external = path.join(home, "external");
  await writeSkill(canonical, "managed", "Canonical");
  await writeSkill(external, "external", "Other");
  await link(canonical, path.join(root, "managed"));
  await link(canonical, path.join(root, "unregistered"));
  await link(external, path.join(root, "external"));
  await link(path.join(home, "absent"), path.join(root, "dead"));
  await mkdir(path.join(root, ".system"));
  await mkdir(path.join(root, "builtin_skills"));
  await mkdir(path.join(root, ".git"));
  await writeFile(path.join(root, "notes.txt"), "plain file");
  await writeSkill(path.join(root, "plain"), "plain", "Local");
  await writeSkill(path.join(root, "replaced"), "replaced", "Changed");
  await writeLinksLedger(paths, [ledger("codex", "managed"), ledger("codex", "replaced"), ledger("codex", "missing")]);
  vi.mocked(readFile).mockClear();
  const report = await scanClientDriftL1(home, paths);
  expect(report.roots.map((root) => root.clientId)).toEqual(["codex"]);
  expect(report.counts).toEqual({
    "managed-link": 1, "unmanaged-real-dir": 1, "replaced-link-real-dir": 1,
    "external-symlink": 1, "dangling-link": 2, "non-skill-entry": 5,
  });
  expect(report.entries.find((entry) => entry.entryName === "missing")).toMatchObject({ kind: "dangling-link", registered: { id: "codex:missing" } });
  expect(vi.mocked(readFile).mock.calls.map(([file]) => file)).toEqual([path.join(paths.stateRoot, "links.json")]);
});

it("skips incomplete folders and deep-scans external links only when explicitly requested", async () => {
  const root = client("claude");
  await mkdir(root, { recursive: true });
  const external = path.join(home, "external");
  await writeSkill(external, "external", "External");
  await link(external, path.join(root, "external"));
  await mkdir(path.join(root, "unfinished"));
  await writeSkill(path.join(root, "unsafe"), "../bad", "Invalid name");
  const report = await scanClientDriftL1(home, paths);
  expect((await inspectDriftL2(report, paths)).skippedExternalLinks.map((entry) => entry.entryName)).toEqual(["external"]);
  const deep = await inspectDriftL2(report, paths, { includeExternalLinks: true });
  expect(deep.incomplete.map((entry) => entry.entryName)).toEqual(["unfinished", "unsafe"]);
  expect(deep.skills).toMatchObject([{ skillName: "external", kind: "new-skill", variants: [{ fileCount: 1 }] }]);
});

it("finds cross-client and store conflicts using deep mtime, bytes and the stable hash", async () => {
  const old = path.join(client("claude"), "shared");
  const fresh = path.join(client("codex"), "shared");
  await writeSkill(old, "shared", "Old ".repeat(300));
  await writeSkill(fresh, "shared", "Short");
  const initial = 1_750_000_000;
  await utimes(path.join(old, "SKILL.md"), initial, initial);
  await utimes(path.join(fresh, "SKILL.md"), initial, initial);
  await adoptSkillFolder(paths, old, { kind: "local-scan", reference: old });
  await utimes(path.join(paths.skillsRoot, "shared", "SKILL.md"), initial, initial);
  const nested = path.join(fresh, "one", "two");
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(nested, "changed"), "deepest");
  const newest = initial + 120;
  await utimes(path.join(nested, "changed"), newest, newest);
  await utimes(fresh, initial, initial);
  await mkdir(path.join(fresh, ".git"));
  await writeFile(path.join(fresh, ".git", "index"), "ignore");
  await utimes(path.join(fresh, ".git", "index"), newest + 120, newest + 120);
  const report = await inspectDriftL2(await scanClientDriftL1(home, paths), paths);
  expect(report.skills).toMatchObject([{
    skillName: "shared", kind: "name-conflict", shorterContentWarning: true,
    variants: [
      { sourceClients: ["codex"], maxMtimeMs: newest * 1000, fileCount: 2, hash: await hashSkillFolder(fresh) },
      { sourceClients: ["claude", "store"], inStore: true },
    ],
  }]);
});

it("deduplicates identical client copies and checks the ten-second conflict window", async () => {
  for (const agent of ["a", "b"]) {
    await writeSkill(path.join(client(agent), "same"), "same", "Identical");
    await writeSkill(path.join(client(agent), "other"), "other", "Diff " + agent);
    const time = 1_750_000_000 + (agent === "a" ? 0 : 5);
    await utimes(path.join(client(agent), "other", "SKILL.md"), time, time);
  }
  const shallow = await scanClientDriftL1(home, paths);
  let deep = await inspectDriftL2(shallow, paths);
  expect(deep.skills).toMatchObject([
    { kind: "name-conflict", shorterContentWarning: true, variants: [{ sourceClients: ["b"] }, { sourceClients: ["a"] }] },
    { kind: "new-skill", variants: [{ sourceClients: ["a", "b"] }] },
  ]);
  const origin = path.join(client("a"), "same");
  await adoptSkillFolder(paths, origin, { kind: "local-scan", reference: origin });
  deep = await inspectDriftL2(shallow, paths);
  expect(deep.skills[1]).toMatchObject({ kind: "identical-to-store", variants: [{ sourceClients: ["a", "b", "store"] }] });
});

it("scans 30 client roots under 20 ms with no per-skill content I/O", async () => {
  const target = path.join(paths.skillsRoot, "fixture");
  await writeSkill(target, "fixture", "Managed");
  const entries: LinkEntry[] = [];
  for (let i = 0; i < 30; i++) {
    const name = "client-" + i;
    const root = client(name);
    await mkdir(root, { recursive: true });
    await link(target, path.join(root, "fixture"));
    entries.push(ledger(name, "fixture"));
  }
  await writeLinksLedger(paths, entries);
  await scanClientDriftL1(home, paths);
  vi.mocked(readFile).mockClear();
  const samples = [];
  for (let i = 0; i < 5; i++) samples.push(await scanClientDriftL1(home, paths));
  expect(samples.every((report) => report.counts["managed-link"] === 30)).toBe(true);
  expect(vi.mocked(readFile).mock.calls.map(([file]) => file)).toEqual(samples.map(() => path.join(paths.stateRoot, "links.json")));
  expect(Math.min(...samples.map((report) => report.scanDurationMs))).toBeLessThan(20);
});
