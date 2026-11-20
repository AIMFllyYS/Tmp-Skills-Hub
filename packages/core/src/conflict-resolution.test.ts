import { mkdir, mkdtemp, readFile, readdir, realpath, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { readConflicts, withConflictWriteLock } from "./conflicts.js";
import { diffConflictVariants, readConflictVariantFile } from "./conflict-diff.js";
import { resolveConflict } from "./conflict-resolve.js";
import { addSkillToGroups, ensureBuiltinGroups, readGroups } from "./groups.js";
import { hashSkillFolder } from "./hash.js";
import { readLinksLedger } from "./links.js";
import { executeReconcile } from "./reconcile.js";
import { readUsageStats, recordUsage } from "./stats.js";
import { initializeStoreLayout } from "./store-layout.js";
import type { HubPaths } from "./store-location.js";
import { readStoreIndex } from "./store.js";
import { zipEntries } from "./zip.js";

let home: string;
let paths: HubPaths;
let active: string;
const body = (text: string) => "---\nname: shared\ndescription: sandbox\n---\n" + text + "\n";

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "hub-conflict-test-")));
  paths = { layoutMode: "split", stateRoot: path.join(home, ".skills-hub"), skillsRoot: path.join(home, "canonical") };
  active = path.join(paths.skillsRoot, "shared");
  await initializeStoreLayout(paths);
  await ensureBuiltinGroups(paths);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function version(id: string, time: number, files: Record<string, string | Buffer> = {}) {
  const dir = path.join(home, "." + id, "skills", "shared");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), body(id));
  for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(dir, name), bytes);
  for (const file of await readdir(dir)) await utimes(path.join(dir, file), time, time);
}

async function generateConflict(extra = false) {
  await version("claude", 1_750_000_000, { "old.txt": "previous\n", "bin": Buffer.from([0, 1]) });
  await version("codex", 1_750_000_200, { "new.txt": "new\n", "bin": Buffer.from([0, 2]), "huge.txt": "long\n".repeat(120_000) });
  if (extra) await version("cursor", 1_750_000_100);
  expect(await executeReconcile(home, paths)).toMatchObject({ ok: true, conflictCount: 1, failures: [] });
  const [record] = await readConflicts(paths);
  const older = record!.variants.find((variant) => variant.sourceClients.includes("claude"))!;
  return { record: record!, older };
}

it("compares added, removed, modified, binary and oversized files safely", async () => {
  const { older } = await generateConflict();
  const diff = await diffConflictVariants(paths, "shared", older.variantId, "active");
  expect(diff.truncated).toBe(true);
  const files = Object.fromEntries(diff.files.map((file) => [file.relPath, file]));
  expect(files["old.txt"]).toMatchObject({ status: "removed", sizeA: 9, sizeB: 0 });
  expect(files["new.txt"]).toMatchObject({ status: "added", sizeB: 4 });
  expect(files.bin).toMatchObject({ status: "modified", isBinary: true, sizeA: 2, sizeB: 2 });
  expect(files["huge.txt"]).toMatchObject({ status: "added", truncated: true });
  expect(files["SKILL.md"]!.hunks?.flatMap((hunk) => hunk.lines)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "del", text: "claude" }), expect.objectContaining({ kind: "add", text: "codex" }),
  ]));
  expect(await readConflictVariantFile(paths, "shared", older.variantId, "SKILL.md")).toMatchObject({ ok: true, content: body("claude") });
  expect(await readConflictVariantFile(paths, "shared", "active", "bin")).toMatchObject({ ok: false, code: "binary" });
  expect(await readConflictVariantFile(paths, "shared", "active", "huge.txt")).toMatchObject({ ok: false, code: "too-large" });
  expect(await readConflictVariantFile(paths, "shared", "active", "../unrelated.md")).toMatchObject({ ok: false, code: "outside" });
});

it("refuses concurrent reconcile or resolution and permits retry after the shared lock releases", async () => {
  const { older } = await generateConflict();
  const decision = { mode: "pick", winnerVariantId: older.variantId } as const;
  await withConflictWriteLock(paths, async () => {
    expect(await executeReconcile(home, paths)).toMatchObject({ ok: false, code: "io-error" });
    expect(await resolveConflict(paths, "shared", decision)).toMatchObject({ ok: false, code: "conflict" });
    expect(await readConflicts(paths)).toHaveLength(1);
  });
  expect(await resolveConflict(paths, "shared", decision)).toMatchObject({ ok: true });
});

it("pick preserves the former active version, archives losers and synchronizes references", async () => {
  const { record, older } = await generateConflict();
  const group = (await readGroups(paths)).groups[0]!;
  await addSkillToGroups(paths, record.activeHash, [group.id]);
  await recordUsage(paths, record.activeHash, "show");
  const result = await resolveConflict(paths, "shared", { mode: "pick", winnerVariantId: older.variantId });
  expect(result).toMatchObject({ ok: true, activeHash: older.hash, remainingVariants: 0 });
  if (!result.ok) throw new Error(result.message);
  expect((await readGroups(paths)).groups.find((item) => item.id === group.id)?.memberHashes).toEqual([older.hash]);
  expect((await readUsageStats(paths)).counters[older.hash]?.show).toBe(1);
  expect((await readLinksLedger(paths)).map((link) => link.skillHash)).toEqual([older.hash, older.hash]);
  expect((await readStoreIndex(paths))[0]?.hash).toBe(older.hash);
  const root = path.join(paths.stateRoot, "archive", "versions");
  expect(await hashSkillFolder(path.join(root, (await readdir(root))[0]!))).toBe(record.activeHash);
  expect((await zipEntries(await readFile(result.archives[0]!))).get("SKILL.md")).toEqual(Buffer.from(body("codex")));
  expect(await readConflicts(paths)).toEqual([]);
  expect(await readFile(path.join(home, ".codex", "skills", "shared", "SKILL.md"), "utf8")).toBe(body("claude"));
});

it("merge rejects invalid paths before applying any content, then stages and publishes a complete revision", async () => {
  const { record } = await generateConflict();
  expect(await resolveConflict(paths, "shared", { mode: "merge", mergedFiles: { "../unrelated.md": "reject" } }))
    .toMatchObject({ ok: false, code: "outside" });
  expect(await hashSkillFolder(active)).toBe(record.activeHash);
  expect(await readConflicts(paths)).toHaveLength(1);
  const result = await resolveConflict(paths, "shared", {
    mode: "merge", mergedFiles: { "SKILL.md": body("Merged"), "guide/note.md": "New guide" }, deletePaths: ["new.txt"],
  });
  expect(result).toMatchObject({ ok: true, archives: [expect.any(String), expect.any(String)] });
  if (!result.ok) throw new Error(result.message);
  expect(await hashSkillFolder(active)).toBe(result.activeHash);
  expect(await readFile(path.join(active, "guide", "note.md"), "utf8")).toBe("New guide");
  expect(await readdir(active)).not.toContain("new.txt");
  expect(await readFile(path.join(home, ".claude", "skills", "shared", "SKILL.md"), "utf8")).toBe(body("Merged"));
  expect(await readConflicts(paths)).toEqual([]);
});

it("split keeps existing links, rejects an occupied name and resolves after the last alternate is split", async () => {
  const { record, older } = await generateConflict(true);
  const second = record.variants.find((variant) => variant.sourceClients.includes("cursor"))!;
  const result = await resolveConflict(paths, "shared", { mode: "split", variantId: older.variantId, newName: "shared-older" });
  expect(result).toMatchObject({ ok: true, remainingVariants: 1, newSkill: { dirName: "shared-older", meta: { name: "shared-older" } } });
  expect(await readConflicts(paths)).toMatchObject([{ variants: [{ hash: record.activeHash }, { hash: second.hash }] }]);
  expect(await resolveConflict(paths, "shared", { mode: "split", variantId: second.variantId, newName: "shared-older" })).toMatchObject({ ok: false, code: "conflict" });
  expect(await resolveConflict(paths, "shared", { mode: "split", variantId: second.variantId, newName: "shared-variant" })).toMatchObject({ ok: true, remainingVariants: 0 });
  expect(await hashSkillFolder(active)).toBe(record.activeHash);
  expect(await readConflicts(paths)).toEqual([]);
  expect(await realpath(path.join(home, ".claude", "skills", "shared"))).toBe(await realpath(active));
  expect((await readStoreIndex(paths)).map((skill) => skill.dirName).sort()).toEqual(["shared", "shared-older", "shared-variant"]);
});
