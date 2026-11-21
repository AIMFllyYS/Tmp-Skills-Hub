import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { adoptSkillFolder, parseSkillMeta, readLinksLedger, readStoreIndex, type HubPaths } from "@skills-hub/core";
import { runBootstrap } from "../src/bootstrap.js";
import { performLinkChange } from "../src/link-actions.js";
import { adoptAndEnableSelfSkill, syncSelfSkill } from "../src/self-skill.js";
import { performInit, resolveConfiguredHubPaths } from "../src/store-shared.js";
import { startUiServer } from "../src/ui-server.js";

const shipped = path.resolve("self-skill");
const legacy = "---\nname: skills-hub\ndescription: legacy guide\n---\nOriginal content\n";
let home: string;
let oldBundle: string;

beforeEach(async () => {
  home = await realpath(await mkdtemp(path.join(os.tmpdir(), "skills-hub-bundled-guide-")));
  oldBundle = path.join(home, "bundle");
  await mkdir(oldBundle);
  await writeFile(path.join(oldBundle, "SKILL.md"), legacy);
});

afterEach(() => rm(home, { recursive: true, force: true, maxRetries: 3 }));

async function pathsAfterBootstrap(): Promise<HubPaths> {
  await runBootstrap({ home, yes: true }, { ui: false, selfSkillDir: oldBundle });
  const configured = await resolveConfiguredHubPaths(home);
  if (!configured.ok) throw new Error(configured.message);
  return configured.paths;
}

it("publishes parseable high-recall guidance that sends edits to the single source", async () => {
  const content = await readFile(path.join(shipped, "SKILL.md"), "utf8");
  const meta = parseSkillMeta(content);
  expect(meta?.name).toBe("skills-hub");
  for (const word of [
    "新建", "创建", "修改", "编辑", "更新", "回写经验", "收录", "启用", "停用", "归档", "冲突合并", "对账收敛", "云端备份",
    "create", "new", "edit", "update", "modify", "refactor", "adopt", "enable", "disable", "archive", "conflicts", "reconcile", "git",
  ]) expect(meta?.description).toContain(word);
  expect(content).toContain("必须先阅读本指南");
  expect(content).toContain("skillsRoot");
  expect(content).toContain("skills-hub verify --accept");
  expect(content).not.toContain("不需要调用我的场景:只是修改");
});

it("upgrades during an existing bootstrap, retaining extra files, client opt-outs and the archived guide", async () => {
  const claude = path.join(home, ".claude", "skills");
  const codex = path.join(home, ".codex", "skills");
  await mkdir(claude, { recursive: true });
  await mkdir(codex, { recursive: true });
  const paths = await pathsAfterBootstrap();
  const active = path.join(paths.skillsRoot, "skills-hub");
  expect((await lstat(path.join(codex, "skills-hub"))).isSymbolicLink()).toBe(true);
  expect((await lstat(path.join(claude, "skills-hub"))).isSymbolicLink()).toBe(true);
  await writeFile(path.join(active, "local-note.md"), "personal note");
  expect(await performLinkChange({
    storeRoot: paths, clientId: "claude", scope: "global", skillsDir: claude, dirNames: ["skills-hub"],
  }, "disable")).toMatchObject({ ok: true });
  const antigravity = path.join(home, ".gemini", "config", "skills");
  await mkdir(antigravity, { recursive: true });
  await runBootstrap({ home }, { ui: false, selfSkillDir: shipped });

  const source = await readFile(path.join(shipped, "SKILL.md"), "utf8");
  expect(await readFile(path.join(active, "local-note.md"), "utf8")).toBe("personal note");
  expect(await readFile(path.join(codex, "skills-hub", "SKILL.md"), "utf8")).toBe(source);
  await expect(lstat(path.join(claude, "skills-hub"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(path.join(antigravity, "skills-hub"))).rejects.toMatchObject({ code: "ENOENT" });
  const [record] = await readStoreIndex(paths);
  expect(record?.meta.description).toBe(parseSkillMeta(source)?.description);
  expect((await readLinksLedger(paths)).map((link) => link.skillHash)).toEqual([record?.hash]);
  const versions = path.join(paths.stateRoot, "archive", "versions");
  const snapshots = await readdir(versions);
  expect(snapshots).toHaveLength(1);
  expect(await readFile(path.join(versions, snapshots[0]!, "SKILL.md"), "utf8")).toBe(legacy);
  expect(await syncSelfSkill(home, paths, shipped)).toEqual({ status: "current", availableClients: ["antigravity", "claude"] });
  expect(await syncSelfSkill(home, paths, oldBundle)).toMatchObject({ status: "current" });
  expect(await readdir(versions)).toEqual(snapshots);
});

it("refreshes the guide before the startup HTTP server serves the updated catalog", async () => {
  const paths = await pathsAfterBootstrap();
  const service = await startUiServer({ home, port: 0, selfSkillDir: shipped });
  try {
    const response = await fetch(service.url + "/api/skills");
    expect(await response.json()).toMatchObject({
      ok: true, skills: [{ dirName: "skills-hub", meta: { description: expect.stringContaining("回写经验") } }],
    });
    expect(await syncSelfSkill(home, paths, shipped)).toMatchObject({ status: "current" });
  } finally {
    await service.close();
  }
});

it("leaves a locally adopted guide untouched without the bundled origin", async () => {
  const result = await performInit(home);
  if (!result.ok) throw new Error(result.message);
  const { paths } = result;
  expect(await adoptSkillFolder(paths, oldBundle, { kind: "local-scan", reference: "manual" })).toMatchObject({ kind: "adopted" });
  await adoptAndEnableSelfSkill(home, paths, shipped);
  expect(await syncSelfSkill(home, paths, shipped)).toMatchObject({ status: "unmanaged" });
  expect(await readFile(path.join(paths.skillsRoot, "skills-hub", "SKILL.md"), "utf8")).toBe(legacy);
});

it("installs the guide after explicit GUI consent, reports conflicts, retries only the requested destination and preserves opt-outs", async () => {
  const codex = path.join(home, ".codex", "skills");
  const buddy = path.join(home, ".workbuddy", "skills");
  const occupied = path.join(buddy, "skills-hub");
  await mkdir(codex, { recursive: true });
  await mkdir(occupied, { recursive: true });
  await writeFile(path.join(occupied, "SKILL.md"), "mine");
  const service = await startUiServer({ home, port: 0, selfSkillDir: shipped });
  const init = async (dirs: string[]) => {
    const response = await fetch(service.url + "/api/store/init", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guideTargets: dirs }),
    });
    expect(response.status).toBe(200);
    return response.json() as Promise<{guide: {clients: {ok: boolean; skillsDir: string}[]}}>;
  };
  try {
    await fetch(service.url + "/api/clients");
    await expect(lstat(path.join(home, ".skills-hub", "config.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await init([codex, buddy])).guide.clients).toMatchObject([
      { skillsDir: codex, ok: true }, { skillsDir: buddy, ok: false },
    ]);
    expect(await readFile(path.join(occupied, "SKILL.md"), "utf8")).toBe("mine");
    const resolved = await resolveConfiguredHubPaths(home);
    if (!resolved.ok) throw new Error("missing store");
    const target = await realpath(path.join(resolved.paths.skillsRoot, "skills-hub"));
    expect(await realpath(path.join(codex, "skills-hub"))).toBe(target);
    await performLinkChange({ storeRoot: resolved.paths, clientId: "codex", scope: "global", skillsDir: codex, dirNames: ["skills-hub"] }, "disable");
    await rm(occupied, { recursive: true });
    expect((await init([buddy])).guide.clients).toMatchObject([{ skillsDir: buddy, ok: true }]);
    expect(await realpath(occupied)).toBe(target);
    await expect(lstat(path.join(codex, "skills-hub"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await service.close(); }
});
