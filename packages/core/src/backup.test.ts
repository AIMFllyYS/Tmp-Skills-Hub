import { lstat, mkdir, readdir, readFile, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBackupSnapshot,
  materializeBackupSnapshot,
  STORE_BACKUPS_DIR,
  verifyBackupSnapshot,
} from "./backup.js";
import { initializeStoreLayout, STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";

const temps: string[] = [];

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function world(): Promise<{ store: string; home: string; skillA: string; skillB: string }> {
  const store = await tmp("skills-hub-bak-store-");
  const home = await tmp("skills-hub-bak-home-");
  await initializeStoreLayout(store);
  const skillA = path.join(home, ".claude", "skills", "alpha");
  const skillB = path.join(home, ".claude", "skills", "beta");
  await mkdir(skillA, { recursive: true });
  await mkdir(skillB, { recursive: true });
  const body = "---\nname: shared\ndescription: d\n---\nsame-bytes\n";
  await writeFile(path.join(skillA, "SKILL.md"), body);
  await writeFile(path.join(skillB, "SKILL.md"), body);
  return { store, home, skillA, skillB };
}

describe("createBackupSnapshot", () => {
  it("同内容只写一份 blob;第二次 backup 不新增;改一文件只多一个 blob", async () => {
    const w = await world();
    const before = await readFile(path.join(w.skillA, "SKILL.md"));
    const first = await createBackupSnapshot(w.store, w.home);
    expect(first.manifest.files.length).toBe(2);
    expect(first.manifest.blobsWritten).toBe(1);
    expect(first.manifest.blobsReused).toBe(1);
    const blobs1 = await readdir(path.join(w.store, STORE_BACKUPS_DIR, "blobs"));
    expect(blobs1).toHaveLength(1);
    expect(await readFile(path.join(w.skillA, "SKILL.md"))).toEqual(before);

    const second = await createBackupSnapshot(w.store, w.home);
    expect(second.manifest.blobsWritten).toBe(0);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(await readdir(path.join(w.store, STORE_BACKUPS_DIR, "blobs"))).toHaveLength(1);

    await writeFile(path.join(w.skillA, "SKILL.md"), "---\nname: shared\ndescription: d\n---\nchanged\n");
    const third = await createBackupSnapshot(w.store, w.home);
    expect(third.manifest.blobsWritten).toBe(1);
    expect(await readdir(path.join(w.store, STORE_BACKUPS_DIR, "blobs"))).toHaveLength(2);

    const restored = path.join(w.store, STORE_TMP_DIR, "restored");
    await materializeBackupSnapshot(first.snapshotDir, restored, first.blobsDir);
    expect(await readFile(path.join(restored, "claude", "alpha", "SKILL.md"), "utf8")).toContain("same-bytes");
  });

  it("库存内链接只记引用;库存外链接复制内容", async () => {
    const w = await world();
    const owned = path.join(w.store, STORE_SKILLS_DIR, "owned");
    await mkdir(owned, { recursive: true });
    await writeFile(path.join(owned, "SKILL.md"), "---\nname: owned\ndescription: d\n---\nstore\n");
    const linkIn = path.join(w.home, ".claude", "skills", "from-store");
    try {
      await symlink(owned, linkIn, process.platform === "win32" ? "junction" : "dir");
    } catch {
      return;
    }
    const outside = await tmp("skills-hub-bak-ext-");
    await writeFile(path.join(outside, "note.md"), "external-only");
    const linkOut = path.join(w.home, ".claude", "skills", "from-out");
    await symlink(path.join(outside, "note.md"), linkOut, "file").catch(async () => {
      await writeFile(linkOut, "external-only");
    });

    const snap = await createBackupSnapshot(w.store, w.home);
    const storeLink = snap.manifest.links.find((l) => l.rel === "from-store");
    if (storeLink !== undefined) {
      expect(storeLink.inStore).toBe(true);
      expect(snap.manifest.files.some((f) => f.rel.startsWith("from-store") && f.hash !== "")).toBe(false);
    }
    expect(snap.manifest.files.some((f) => f.rel === "from-out" || f.rel.endsWith("note.md"))).toBe(true);
  });

  it("改坏 blob 后 verify 报出 rel", async () => {
    const w = await world();
    const snap = await createBackupSnapshot(w.store, w.home);
    const hash = snap.manifest.files[0]!.hash;
    const rel = snap.manifest.files[0]!.rel;
    await writeFile(path.join(snap.blobsDir, hash), "corrupted");
    const report = await verifyBackupSnapshot(w.store, snap.snapshotId);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.rel === rel && i.reason === "mismatch")).toBe(true);
  });

  it("源目录 mtime 不被改写", async () => {
    const w = await world();
    const p = path.join(w.skillA, "SKILL.md");
    const past = new Date("2024-01-01T00:00:00.000Z");
    await utimes(p, past, past);
    const st0 = await lstat(p);
    await createBackupSnapshot(w.store, w.home);
    const st1 = await lstat(p);
    expect(st1.mtimeMs).toBe(st0.mtimeMs);
  });
});
