import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { conflictVariantPath, readConflicts, recordConflict } from "./conflicts.js";
import { addSkillToGroups, ensureBuiltinGroups, readGroups } from "./groups.js";
import { hashSkillFolder } from "./hash.js";
import { applyLinkSet } from "./link-switch.js";
import { readLinksLedger, visibleInFromLedger, writeLinksLedger, type LinkEntry } from "./links.js";
import { executeReconcile, planReconcile } from "./reconcile.js";
import { readUsageStats, recordUsage } from "./stats.js";
import { initializeStoreLayout } from "./store-layout.js";
import type { HubPaths } from "./store-location.js";
import { adoptSkillFolder, readStoreIndex } from "./store.js";

let home: string;
let paths: HubPaths;
const linkType = process.platform === "win32" ? "junction" : "dir";

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "hub-reconcile-test-")));
  paths = { stateRoot: path.join(home, ".skills-hub"), skillsRoot: path.join(home, "canonical"), layoutMode: "split" };
  await initializeStoreLayout(paths);
  await ensureBuiltinGroups(paths);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const client = (id: string) => path.join(home, "." + id, "skills");

function text(name: string, content: string): string {
  return `---\nname: ${name}\ndescription: sandbox\n---\n${content}\n`;
}

async function fixture(dir: string, name: string, content: string, time = 1_750_000_000): Promise<void> {
  await mkdir(dir, { recursive: true });
  const manifest = path.join(dir, "SKILL.md");
  await writeFile(manifest, text(name, content));
  await utimes(manifest, time, time);
}

function linkEntry(id: string, name: string, hash: string): LinkEntry {
  return { id: id + ":" + name, clientId: id, scope: "global", targetDir: client(id), entryName: name, skillHash: hash, kind: "junction", createdAt: "2026-11-20T00:00:00.000Z" };
}

it("plans without writes, archives original bytes and converges mixed roots without modifying skipped entries", async () => {
  const claude = client("claude");
  const codex = client("codex");
  const cursor = client("cursor");
  const active = path.join(paths.skillsRoot, "shared");
  const activeSeed = path.join(home, "old-sample");
  await fixture(activeSeed, "shared", "Old canonical body ".repeat(100));
  const imported = await adoptSkillFolder(paths, activeSeed, { kind: "local-scan", reference: activeSeed });
  if (imported.kind !== "adopted") throw new Error(imported.kind);
  const oldHash = imported.record.hash;
  await utimes(path.join(active, "SKILL.md"), 1_750_000_000, 1_750_000_000);
  const groupId = (await readGroups(paths)).groups[0]!.id;
  await addSkillToGroups(paths, oldHash, [groupId]);
  await recordUsage(paths, oldHash, "show");
  for (const id of ["claude", "cursor"]) {
    await mkdir(client(id), { recursive: true });
    expect(await applyLinkSet(paths, { targetDir: client(id), entries: [linkEntry(id, "shared", oldHash)] })).toMatchObject({ ok: true });
  }
  const replaced = path.join(claude, "shared");
  await unlink(replaced);
  await fixture(replaced, "shared", "New short revision", 1_750_000_200);
  const crossClient = path.join(codex, "shared-alias");
  await fixture(crossClient, "shared", "Alternative", 1_750_000_100);
  const alias = path.join(codex, "local-alias");
  await fixture(alias, "local", "Only in a client");
  await mkdir(path.join(alias, ".git"));
  await writeFile(path.join(alias, ".git", "HEAD"), "preserve original Git data");
  const system = path.join(claude, ".system");
  await fixture(system, "system-fixture", "Do not touch");
  const external = path.join(home, "external");
  await fixture(external, "ego-browser", "External source");
  await symlink(external, path.join(codex, "ego-browser"), linkType);
  await writeLinksLedger(paths, [...await readLinksLedger(paths), linkEntry("codex", "dead", "old")]);

  const plan = await planReconcile(home, paths);
  expect(plan).toMatchObject({
    backupRequired: true, danglingToPrune: 1,
    toAdopt: [{ skillName: "local" }],
    conflicts: [{ skillName: "shared", shorterContentWarning: true }],
    skippedExternalLinks: [{ entryName: "ego-browser" }],
    untouchedNonSkill: [{ entryName: ".system" }],
  });
  expect(await readdir(paths.stateRoot)).not.toContain("backups");
  const output = await executeReconcile(home, paths, { pruneDangling: true });
  expect(output).toMatchObject({ ok: true, backupVerified: true, adoptedCount: 1, conflictCount: 1, linksCreated: 3, skippedExternalLinks: 1, danglingPruned: 1, failures: [] });

  for (const link of [replaced, crossClient, path.join(cursor, "shared")]) {
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await realpath(link)).toBe(await realpath(active));
  }
  expect(await realpath(alias)).toBe(await realpath(path.join(paths.skillsRoot, "local")));
  expect(await realpath(path.join(codex, "ego-browser"))).toBe(await realpath(external));
  await expect(readFile(path.join(system, "SKILL.md"), "utf8")).resolves.toBe(text("system-fixture", "Do not touch"));
  await expect(readFile(path.join(active, "SKILL.md"), "utf8")).resolves.toBe(text("shared", "New short revision"));
  const [conflict] = await readConflicts(paths);
  expect(conflict?.variants).toHaveLength(3);
  for (const variant of conflict!.variants) {
    expect(await hashSkillFolder(conflictVariantPath(paths, "shared", variant.variantId))).toBe(variant.hash);
  }
  expect((await readGroups(paths)).groups.find(({ id }) => id === groupId)?.memberHashes).toEqual([conflict!.activeHash]);
  expect((await readUsageStats(paths)).counters[conflict!.activeHash]?.show).toBe(1);
  const ledger = await readLinksLedger(paths);
  expect(visibleInFromLedger("local", ledger)).toEqual(["codex"]);
  expect(ledger.find(({ entryName }) => entryName === "shared-alias")?.skillHash).toBe(conflict!.activeHash);
  expect(ledger.find(({ entryName }) => entryName === "dead")).toBeUndefined();
  const versions = path.join(paths.stateRoot, "archive", "versions");
  const [version] = await readdir(versions);
  expect(await hashSkillFolder(path.join(versions, version!))).toBe(oldHash);
  const archives = await readdir(path.join(paths.stateRoot, "archive", "reconcile"), { recursive: true });
  const archivedGit = archives.find((file) => file.endsWith(path.join("local-alias", ".git", "HEAD")));
  await expect(readFile(path.join(paths.stateRoot, "archive", "reconcile", archivedGit!), "utf8")).resolves.toBe("preserve original Git data");
  expect(await executeReconcile(home, paths, { pruneDangling: true })).toMatchObject({
    ok: true, adoptedCount: 0, conflictCount: 0, linksCreated: 0, danglingPruned: 0, failures: [],
  });
});

it("restores each directory in a failed link batch and preserves unrelated ledger rows", async () => {
  const a = path.join(client("codex"), "a");
  const b = path.join(client("codex"), "b");
  await fixture(a, "a", "First original");
  await fixture(b, "b", "Second original");
  const dangling = linkEntry("codex", "unrelated", "old");
  await writeLinksLedger(paths, [dangling]);
  const output = await executeReconcile(home, paths, {
    switchLinks: (root, plan, options) => applyLinkSet(root, plan, { ...options, failAfter: 1 }),
  });
  expect(output).toMatchObject({
    ok: true, backupVerified: true, linksCreated: 0,
    failures: [{ skillName: "a", rolledBack: true }, { skillName: "b", rolledBack: true }],
  });
  expect((await lstat(a)).isSymbolicLink()).toBe(false);
  expect((await lstat(b)).isSymbolicLink()).toBe(false);
  await expect(readFile(path.join(a, "SKILL.md"), "utf8")).resolves.toBe(text("a", "First original"));
  await expect(readFile(path.join(b, "SKILL.md"), "utf8")).resolves.toBe(text("b", "Second original"));
  expect(await readLinksLedger(paths)).toEqual([dangling]);
});

it("stops on failed backup verification before moving an original or publishing an asset", async () => {
  const original = path.join(client("codex"), "sample");
  await fixture(original, "sample", "Keep");
  const result = await executeReconcile(home, paths, {
    verifyBackup: async (_root, snapshotId) => ({
      ok: false, snapshotId: snapshotId!, checked: 1,
      issues: [{ hash: "fixture", rel: "sample/SKILL.md", reason: "mismatch" }],
    }),
  });
  expect(result).toMatchObject({ ok: false, code: "verify-failed" });
  expect(await readStoreIndex(paths)).toEqual([]);
  expect((await lstat(original)).isSymbolicLink()).toBe(false);
  expect(await readFile(path.join(original, "SKILL.md"), "utf8")).toBe(text("sample", "Keep"));
});

it("opts into external links without changing the target directory", async () => {
  const target = path.join(home, "external");
  await fixture(target, "remote", "External bytes");
  await mkdir(client("codex"), { recursive: true });
  const alias = path.join(client("codex"), "alias");
  await symlink(target, alias, linkType);
  expect(await executeReconcile(home, paths, { includeExternalLinks: true }))
    .toMatchObject({ ok: true, adoptedCount: 1, linksCreated: 1, externalLinksAdopted: 1, failures: [] });
  expect(await realpath(alias)).toBe(await realpath(path.join(paths.skillsRoot, "remote")));
  expect(await readFile(path.join(target, "SKILL.md"), "utf8")).toBe(text("remote", "External bytes"));
});

it("merges repeated conflict metadata by hash without duplicating variants", async () => {
  const x = path.join(client("claude"), "same");
  const y = path.join(client("codex"), "same");
  await fixture(x, "same", "A", 1_750_000_000);
  await fixture(y, "same", "B", 1_750_000_200);
  expect(await executeReconcile(home, paths)).toMatchObject({ ok: true, conflictCount: 1, failures: [] });
  const [old] = await readConflicts(paths);
  const newest = old!.variants[0]!;
  const result = await recordConflict(paths, {
    ...old!,
    variants: [{ ...newest, maxMtimeMs: newest.maxMtimeMs + 15_000, sourceClients: ["another"] }],
  });
  expect(result.variants).toHaveLength(2);
  expect(result.variants[0]).toMatchObject({ sourceClients: ["another", "codex"], maxMtimeMs: newest.maxMtimeMs + 15_000 });
});
