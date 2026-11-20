import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBackupSnapshot,
  materializeBackupSnapshot,
  readBackupManifest,
  STORE_BACKUPS_DIR,
} from "@skills-hub/core";
import { runBootstrap } from "../src/bootstrap.js";
import { resolveUiStoreRoot } from "../src/ui-server.js";

const tempRoots: string[] = [];

async function newHome(): Promise<string> {
  const home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-bootstrap-"));
  tempRoots.push(home);
  await mkdir(path.join(home, ".claude", "skills", "sample-a"), { recursive: true });
  await mkdir(path.join(home, ".cursor", "skills", "sample-b"), { recursive: true });
  await writeFile(path.join(home, ".claude", "skills", "sample-a", "SKILL.md"), ["---", "name: sample-a", "description: A 测试 skill", "---", "", "# sample-a", "", "demo."].join("\n") + "\n", "utf8");
  await writeFile(path.join(home, ".cursor", "skills", "sample-b", "SKILL.md"), ["---", "name: sample-b", "description: B 测试 skill", "---", "", "# sample-b", "", "demo."].join("\n") + "\n", "utf8");
  return home;
}

async function snapshotIds(store: string): Promise<string[]> {
  const names = await readdir(path.join(store, STORE_BACKUPS_DIR));
  return names.filter((n) => n !== "blobs" && n !== "latest");
}

afterEach(async () => {
  for (const dir of tempRoots.splice(0)) {
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true });
  }
  process.exitCode = 0;
});

function answers(seq: string[]): ((p: string) => Promise<string>) & { called: string[] } {
  let i = 0;
  const called: string[] = [];
  const fn = async (p: string): Promise<string> => { called.push(p); return seq[i++] ?? ""; };
  return Object.assign(fn, { called });
}

describe("runBootstrap", () => {
  it("全流程:确认备份与接管 → 备份、库存和纯软链接齐全", async () => {
    const home = await newHome();
    const ask = answers(["", "Y"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    const store = path.join(home, ".skills-hub");
    const pointer = JSON.parse(await readFile(path.join(store, "config.json"), "utf8")) as { storeRoot: string };
    expect(pointer.storeRoot).toBe(store);
    const skills = await import("node:fs/promises").then((m) => m.readdir(path.join(store, "skills")));
    expect(skills).toContain("sample-a");
    expect(skills).toContain("sample-b");
    const snaps = await snapshotIds(store);
    expect(snaps).toHaveLength(1);
    const snap = path.join(store, STORE_BACKUPS_DIR, snaps[0]!);
    const manifest = await readBackupManifest(snap);
    expect(manifest.files.length).toBeGreaterThanOrEqual(2);
    const restored = path.join(home, "restored");
    await materializeBackupSnapshot(snap, restored, path.join(store, STORE_BACKUPS_DIR, "blobs"));
    await expect(
      readFile(path.join(restored, "claude", "sample-a", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: sample-a");
    expect(ask.called.length).toBe(2);
    const linked = path.join(home, ".claude", "skills", "sample-a");
    expect((await lstat(linked)).isSymbolicLink()).toBe(true);
    expect(await realpath(linked)).toBe(await realpath(path.join(store, "skills", "sample-a")));
  });

  it("--yes 仍强制创建备份，并替换客户端真实目录", async () => {
    const home = await newHome();
    const ask = answers([]);
    await runBootstrap({ home, yes: true }, { readLine: ask, ui: false });
    const backups = await snapshotIds(path.join(home, ".skills-hub"));
    expect(backups).toHaveLength(1);
    expect(ask.called).toEqual([]);
    expect((await lstat(path.join(home, ".cursor", "skills", "sample-b"))).isSymbolicLink()).toBe(true);
  });

  it("迁移确认 N:取消,不做任何改动", async () => {
    const home = await newHome();
    const ask = answers(["", "N"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    expect(await readdir(home)).toEqual([".claude", ".cursor"]);
  });

  it("幂等:库存已就绪时零交互,直接返回", async () => {
    const home = await newHome();
    await runBootstrap({ home }, { readLine: answers(["", "Y"]) as never, ui: false });
    const snaps1 = await snapshotIds(path.join(home, ".skills-hub"));
    const ask2 = answers(["should-not-be-called"]);
    await runBootstrap({ home }, { readLine: ask2 as never, ui: false });
    expect(ask2.called.length).toBe(0);
    expect(await snapshotIds(path.join(home, ".skills-hub"))).toEqual(snaps1);
  });

  it("非 TTY 且无 --yes:拒绝执行", async () => {
    const home = await newHome();
    await runBootstrap({ home });
    expect(process.exitCode).toBe(2);
  });

  it("首次初始化后启动面板时传 home 基座,不传 storeRoot", async () => {
    const home = await newHome();
    const storeRoot = path.join(home, "hub-store");
    const captured: { port?: number; home?: string }[] = [];
    const ask = answers([storeRoot, "Y"]);
    await runBootstrap({ home }, {
      readLine: ask as never,
      ui: async (opts) => {
        captured.push(opts);
      },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.home).toBe(home);
    expect(captured[0]!.home).not.toBe(path.resolve(storeRoot));
    const pointer = JSON.parse(await readFile(path.join(home, ".skills-hub", "config.json"), "utf8")) as { storeRoot: string; skillsRoot: string };
    expect(pointer.storeRoot).toBe(path.join(home, ".skills-hub"));
    expect(pointer.skillsRoot).toBe(await realpath(storeRoot));
    expect(captured[0]!.home).not.toBe(pointer.storeRoot);
    expect(await resolveUiStoreRoot(captured[0]!.home!)).toBe(pointer.storeRoot);
  });

  it("面板库存读指针,不把 home 基座当成空库存", async () => {
    const home = await newHome();
    const storeRoot = path.join(home, "hub-store");
    await mkdir(path.join(home, ".skills-hub"), { recursive: true });
    await writeFile(
      path.join(home, ".skills-hub", "config.json"),
      JSON.stringify({ storeRoot }) + "\n",
      "utf8",
    );
    expect(await resolveUiStoreRoot(home)).toBe(storeRoot);
  });

  it("客户端之间的链接包含回滚内容;悬空链接不炸", async () => {
    const home = await newHome();
    const realDir = path.join(home, ".agents", "skills", "linked-skill");
    await mkdir(realDir, { recursive: true });
    await writeFile(path.join(realDir, "SKILL.md"), ["---", "name: linked-skill", "description: linked test skill", "---", "", "# linked"].join("\n") + "\n", "utf8");
    await symlink(realDir, path.join(home, ".claude", "skills", "linked-skill"), "junction");
    await symlink(path.join(home, ".agents", "skills", "ghost"), path.join(home, ".claude", "skills", "dangling-skill"), "junction");
    const ask = answers(["", "Y"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    const snaps = await snapshotIds(path.join(home, ".skills-hub"));
    const manifest = await readBackupManifest(path.join(home, ".skills-hub", STORE_BACKUPS_DIR, snaps[0]!));
    const rels = manifest.links.map((l) => l.rel);
    expect(rels).toContain("linked-skill");
    expect(rels).toContain("dangling-skill");
    expect(manifest.links.find((l) => l.rel === "linked-skill")!.inStore).toBe(false);
    expect(manifest.files.filter((f) => f.clientId === "claude").some((f) => f.rel.includes("linked-skill"))).toBe(true);
  });

  it("三客户端指向库存外同一内容时只写一份 blob,源目录零写入", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-backup-dedup-"));
    tempRoots.push(home);
    const store = path.join(home, "hub-store");
    await mkdir(store, { recursive: true });
    const real = path.join(home, "real-skill");
    await mkdir(real, { recursive: true });
    const body = ["---", "name: shared", "description: shared skill", "---", "", "# shared"].join("\n") + "\n";
    const srcFile = path.join(real, "SKILL.md");
    await writeFile(srcFile, body, "utf8");
    const before = await readFile(srcFile);
    for (const c of [".claude", ".cursor", ".codex"]) {
      await mkdir(path.join(home, c, "skills"), { recursive: true });
      await symlink(real, path.join(home, c, "skills", "shared"), "junction");
    }
    const bak = await createBackupSnapshot(store, home);
    const after = await readFile(srcFile);
    expect(Buffer.compare(before, after)).toBe(0);
    expect(bak.manifest.files.length).toBe(3);
    expect(bak.manifest.blobsWritten).toBe(1);
    expect(bak.manifest.blobsReused).toBe(2);
    expect(await readdir(path.join(store, STORE_BACKUPS_DIR, "blobs"))).toHaveLength(1);
    const restored = path.join(home, "restored");
    await materializeBackupSnapshot(bak.snapshotDir, restored, bak.blobsDir);
    for (const id of ["claude", "cursor", "codex"]) {
      await expect(
        readFile(path.join(restored, id, "shared", "SKILL.md"), "utf8"),
      ).resolves.toBe(body);
    }
  });
});
