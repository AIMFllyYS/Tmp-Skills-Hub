import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { HubPaths } from "@skills-hub/core";
import { performReconcileScanL1 } from "../src/exports.js";
import { performInit } from "../src/store-shared.js";
import { createUiApp } from "../src/ui-server.js";

let home: string;
let paths: HubPaths;

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "skills-hub-reconcile-cli-")));
  const init = await performInit(home);
  if (!init.ok) throw new Error(init.message);
  paths = init.paths;
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function skill(root: string, name: string, content: string, time = 1_750_000_000) {
  await mkdir(root, { recursive: true });
  const file = path.join(root, "SKILL.md");
  await writeFile(file, `---\nname: ${name}\ndescription: sandbox\n---\n${content}\n`);
  await utimes(file, time, time);
}

function cli(...args: string[]) {
  const result = spawnSync(process.execPath, [path.resolve("dist/index.js"), "reconcile", "--home", home, "--json", ...args], { encoding: "utf8" });
  expect(result.stdout, result.stderr).not.toBe("");
  return { code: result.status, body: JSON.parse(result.stdout) as unknown };
}

it("uses the CLI JSON envelope, requires authorization and previews without writing", async () => {
  const original = path.join(home, ".codex", "skills", "demo");
  await skill(original, "demo", "new skill");
  expect(cli()).toMatchObject({ code: 2, body: { command: "reconcile", code: "auth-required" } });
  expect(cli("--dry-run")).toMatchObject({ code: 0, body: {
    command: "reconcile", dryRun: true, backupRequired: true, summary: { unmanagedRealDirs: 1 },
    toAdopt: [{ skillName: "demo", action: "adopt" }],
  } });
  expect((await lstat(original)).isSymbolicLink()).toBe(false);
  expect(await readdir(paths.stateRoot)).not.toContain("backups");
  expect(cli("--yes")).toMatchObject({ code: 0, body: {
    command: "reconcile", dryRun: false, backupVerified: true, adoptedCount: 1, linksCreated: 1,
  } });
  expect(await realpath(original)).toBe(await realpath(path.join(paths.skillsRoot, "demo")));
  expect(await performReconcileScanL1(home)).toMatchObject({ managedLinks: 1, unmanagedRealDirs: 0, newConflicts: 0 });
});

it("serves scan, read-only preview and idempotent apply with structured validation", async () => {
  const claude = path.join(home, ".claude", "skills", "mixed");
  const codex = path.join(home, ".codex", "skills", "mixed");
  await skill(claude, "mixed", "Older");
  await skill(codex, "mixed", "Newer", 1_750_000_120);
  const app = createUiApp({ paths, home });
  const bare = createUiApp({ home });
  const post = (route: string, body: object, origin?: string) => app.request("/api/reconcile/" + route, {
    method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
  expect((await bare.request("/api/reconcile/scan")).status).toBe(503);
  expect((await post("apply", {}, "https://unrelated.example")).status).toBe(403);
  expect((await app.request("/api/reconcile/apply", { method: "POST" })).status).toBe(400);
  expect((await post("preview", { includeExternalLinks: "true" })).status).toBe(400);
  expect(await (await app.request("/api/reconcile/scan")).json()).toMatchObject({
    command: "reconcile-scan", clientsScanned: 2, unmanagedRealDirs: 2, newConflicts: 1,
  });
  expect(await (await post("preview", {})).json()).toMatchObject({ conflicts: [{
    skillName: "mixed", provisionalWinnerClient: "codex", variantCount: 2,
    variants: [{ isProvisionalWinner: true }, { isProvisionalWinner: false }],
  }] });
  expect((await lstat(claude)).isSymbolicLink()).toBe(false);
  expect(await (await post("apply", {})).json()).toMatchObject({
    backupVerified: true, snapshotId: expect.any(String), conflictCount: 1, linksCreated: 2, failures: [],
  });
  expect(await realpath(claude)).toBe(await realpath(codex));
  expect(await (await post("apply", {})).json()).toMatchObject({ adoptedCount: 0, conflictCount: 0, linksCreated: 0, failures: [] });
  expect(await (await app.request("/api/reconcile/scan")).json()).toMatchObject({ managedLinks: 2, unmanagedRealDirs: 0, newConflicts: 0 });
});

it("takes external links only when the CLI opts in", async () => {
  const client = path.join(home, ".codex", "skills");
  const source = path.join(home, "external");
  const alias = path.join(client, "alias");
  await mkdir(client, { recursive: true });
  await skill(source, "external", "External target");
  await symlink(source, alias, process.platform === "win32" ? "junction" : "dir");
  expect(cli("--dry-run")).toMatchObject({ body: { skippedExternalLinks: [{ skillName: "alias" }] } });
  expect(cli("--dry-run", "--include-external-links")).toMatchObject({ body: { toAdopt: [{ skillName: "external" }], skippedExternalLinks: [] } });
  const applied = cli("--yes", "--include-external-links");
  expect(applied).toMatchObject({ code: 0, body: { externalLinksAdopted: 1 } });
  expect(await realpath(alias)).toBe(await realpath(path.join(paths.skillsRoot, "external")));
  expect((await lstat(path.join(source, "SKILL.md"))).isFile()).toBe(true);
});
