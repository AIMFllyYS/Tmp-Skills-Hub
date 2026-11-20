import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  adoptSkillFolder,
  applyLinkSet,
  archiveSkill,
  checkLinksLedger,
  createAndCommit,
  createBackupSnapshot,
  discoverClientRoots,
  initializeStoreLayout,
  normalizeHubPaths,
  readHubConfig,
  readPointerStoreRoot,
  readStoreIndex,
  resolveHubPaths,
  restoreArchivedSkill,
  saveSkillFile,
  verifyBackupSnapshot,
  writeHubConfig,
  type HubPaths,
  type LinkEntry,
} from "./index.js";

let home: string;
let paths: HubPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "hub-paths-test-"));
  paths = {
    stateRoot: path.join(home, ".skills-hub"),
    skillsRoot: path.join(home, "assets", "skills"),
    layoutMode: "split",
  };
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

it("uses a sandbox v2 config ahead of an explicit legacy manifest and caller pointer", async () => {
  await initializeStoreLayout(home);
  await initializeStoreLayout(paths);
  const file = path.join(paths.stateRoot, "config.json");
  const config = {
    version: 2 as const,
    stateRoot: paths.stateRoot,
    skillsRoot: paths.skillsRoot,
    storeRoot: home,
    git: { enabled: true, branch: "main" },
    autoLaunch: false,
    silentTray: true,
  };
  await writeHubConfig(file, config);
  expect(await readHubConfig(file)).toEqual({ ...config, storeRoot: paths.stateRoot });
  expect(await readPointerStoreRoot(file)).toBe(paths.stateRoot);
  expect(await resolveHubPaths({ cliHome: home, envHome: path.join(home, "env") })).toEqual({
    ok: true, source: "cli", paths,
  });
  expect(await resolveHubPaths({ pointerFilePath: file })).toEqual({ ok: true, source: "pointer", paths });
});

it("resolves old pointers and manifests with the original layout", async () => {
  const file = path.join(home, "config.json");
  await initializeStoreLayout(home);
  await writeFile(file, JSON.stringify({ storeRoot: home }));
  const legacy = { stateRoot: home, skillsRoot: path.join(home, "skills"), layoutMode: "legacy" };
  expect(await resolveHubPaths({ pointerFilePath: file })).toEqual({ ok: true, source: "pointer", paths: legacy });
  expect(await resolveHubPaths({ cliHome: home })).toEqual({ ok: true, source: "cli", paths: legacy });
  expect(normalizeHubPaths(paths)).toBe(paths);
});

it("rejects a malformed sandbox config without using a different store", async () => {
  await initializeStoreLayout(home);
  await initializeStoreLayout(paths);
  const file = path.join(paths.stateRoot, "config.json");
  await writeFile(file, JSON.stringify({ version: 2, storeRoot: home, stateRoot: home }));
  expect(await resolveHubPaths({ cliHome: home })).toMatchObject({ ok: false, reason: "invalid-pointer" });
  await writeFile(file, JSON.stringify({ version: 2, stateRoot: home, skillsRoot: "../relative" }));
  expect(await resolveHubPaths({ cliHome: home })).toMatchObject({ ok: false, reason: "invalid-pointer" });
});

it("keeps assets, links, edit snapshots and backups in their declared locations", async () => {
  await initializeStoreLayout(paths);
  expect((await initializeStoreLayout(paths)).created).toBe(false);
  const fakeClient = path.join(home, ".claude", "skills");
  const clientAlias = path.join(home, ".alias");
  const importFolder = path.join(home, "import");
  await mkdir(fakeClient, { recursive: true });
  await mkdir(clientAlias);
  await mkdir(importFolder);
  await symlink(paths.skillsRoot, path.join(clientAlias, "skills"), process.platform === "win32" ? "junction" : "dir");
  const original = "---\nname: imported\ndescription: original\n---\n";
  await writeFile(path.join(importFolder, "SKILL.md"), original);
  expect((await discoverClientRoots(home, { storeRoot: paths })).map((root) => root.clientId)).toEqual(["claude"]);
  expect(await adoptSkillFolder(paths, importFolder, { kind: "local-scan", reference: importFolder }))
    .toMatchObject({ kind: "adopted" });
  expect(await createAndCommit(paths, "authored", "draft promoted")).toMatchObject({ kind: "committed" });
  const imported = (await readStoreIndex(paths)).find((skill) => skill.dirName === "imported")!;
  const entry: LinkEntry = {
    id: "claude/imported",
    clientId: "claude",
    scope: "global",
    targetDir: fakeClient,
    entryName: "imported",
    skillHash: imported.hash,
    kind: "junction",
    createdAt: "2026-11-20T00:00:00.000Z",
  };
  expect(await applyLinkSet(paths, { targetDir: fakeClient, entries: [entry] })).toMatchObject({ ok: true });
  const skillDir = path.join(paths.skillsRoot, "imported");
  await expect(realpath(path.join(fakeClient, "imported"))).resolves.toBe(await realpath(skillDir));
  expect(await checkLinksLedger(paths, [entry])).toMatchObject([{ state: "ok" }]);
  const edited = original + "Edited\n";
  expect(await saveSkillFile({ storeRoot: paths, skillDir, relPath: "SKILL.md", content: edited }))
    .toMatchObject({ ok: true });
  await expect(readFile(path.join(fakeClient, "imported", "SKILL.md"), "utf8")).resolves.toBe(edited);
  const versions = path.join(paths.stateRoot, "archive", "versions");
  const [version] = await readdir(versions);
  await expect(readFile(path.join(versions, version!, "SKILL.md"), "utf8")).resolves.toBe(original);
  const backup = await createBackupSnapshot(paths, home);
  expect(backup.manifest.links).toMatchObject([{ rel: "imported", inStore: true }]);
  expect(backup.manifest.files).toEqual([]);
  expect(await verifyBackupSnapshot(paths, backup.snapshotId)).toMatchObject({ ok: true });
  expect(await archiveSkill(paths, "imported")).toMatchObject({ ok: true, removedLinks: 1 });
  expect(await restoreArchivedSkill(paths, "imported")).toMatchObject({ ok: true });
  await expect(readFile(path.join(skillDir, "SKILL.md"), "utf8")).resolves.toBe(edited);
  expect(await readdir(paths.skillsRoot)).toEqual(["authored", "imported"]);
});
