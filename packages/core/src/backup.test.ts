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
import { asideSkill, previewRestoreClientSkills, restoreClientSkills, unlinkNoFollow } from "./backup-restore.js";
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

describe("restoreClientSkills", () => {
  it("新格式:改坏客户端后按快照拼回,不整目录改名 skills", async () => {
    const w = await world();
    const snap = await createBackupSnapshot(w.store, w.home);
    await writeFile(path.join(w.skillA, "SKILL.md"), "---\nname: shared\ndescription: d\n---\nmutated\n");
    const preview = await previewRestoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.format).toBe("blobs");
    expect(preview.skills).toBeGreaterThan(0);
    const skillsDir = path.join(w.home, ".claude", "skills");
    const beforeName = (await readdir(path.dirname(skillsDir))).includes("skills");
    const result = await restoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(result.ok).toBe(true);
    expect(await readFile(path.join(w.skillA, "SKILL.md"), "utf8")).toContain("same-bytes");
    expect((await readdir(path.dirname(skillsDir))).includes("skills")).toBe(beforeName);
    expect((await readdir(skillsDir)).some((n) => n.includes("pre-restore"))).toBe(false);
  });

  it("verify 失败不写盘", async () => {
    const w = await world();
    const snap = await createBackupSnapshot(w.store, w.home);
    const hash = snap.manifest.files[0]!.hash;
    await writeFile(path.join(snap.blobsDir, hash), "corrupted");
    await writeFile(path.join(w.skillA, "SKILL.md"), "---\nname: shared\ndescription: d\n---\nkeep-me\n");
    const result = await restoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("verify-failed");
    expect(await readFile(path.join(w.skillA, "SKILL.md"), "utf8")).toContain("keep-me");
  });

  it("快照里的库存链接还原为 junction/symlink,不跟随、不整目录改名", async () => {
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
    const snap = await createBackupSnapshot(w.store, w.home);
    const link = snap.manifest.links.find((l) => l.rel === "from-store");
    if (link === undefined) return;
    await writeFile(path.join(w.skillA, "SKILL.md"), "---\nname: shared\ndescription: d\n---\nmutated\n");
    const result = await restoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(result.ok).toBe(true);
    const st = await lstat(linkIn);
    expect(st.isSymbolicLink() || st.isDirectory()).toBe(true);
    expect(await readFile(path.join(owned, "SKILL.md"), "utf8")).toContain("store");
    expect((await readdir(path.join(w.home, ".claude", "skills"))).some((n) => n.includes("pre-restore"))).toBe(false);
  });

  it("旧 roots/ 快照能还原,并跳过 skills-hub 目录", async () => {
    const w = await world();
    const id = "2026-08-16T19-40-41.796Z-old";
    const snapDir = path.join(w.store, STORE_BACKUPS_DIR, id);
    const src = path.join(snapDir, "roots", "claude", ".claude", "skills", "gamma");
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, "SKILL.md"), "---\nname: gamma\ndescription: g\n---\nold-roots\n");
    const junk = path.join(snapDir, "roots", "skills-hub.pre-bootstrap-x", ".skills-hub.pre-bootstrap-x", "skills", "nope");
    await mkdir(junk, { recursive: true });
    await writeFile(path.join(junk, "SKILL.md"), "---\nname: nope\ndescription: n\n---\nskip\n");
    await writeFile(path.join(snapDir, "manifest.json"), JSON.stringify({
      snapshotId: id,
      createdAt: "2026-08-16T19:41:03.754Z",
      clientRoots: 2,
      skillDirs: 2,
    }) + "\n");
    const destGamma = path.join(w.home, ".claude", "skills", "gamma", "SKILL.md");
    const result = await restoreClientSkills(w.store, w.home, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("roots");
    expect(result.skippedOwnDirs.some((s) => s.startsWith("skills-hub"))).toBe(true);
    expect(await readFile(destGamma, "utf8")).toContain("old-roots");
    expect(await existsSafe(path.join(w.home, ".skills-hub.pre-bootstrap-x"))).toBe(false);
  });

  it("Antigravity: 支持 .gemini/config/skills 的快照、canonical 选择与 roots 还原", async () => {
    const w = await world();
    const agDir = path.join(w.home, ".gemini", "config", "skills", "zeta");
    await mkdir(agDir, { recursive: true });
    await writeFile(path.join(agDir, "SKILL.md"), "---\nname: zeta\ndescription: z\n---\nantigravity-v1\n");
    const snap = await createBackupSnapshot(w.store, w.home);

    // 即使同时存在 .antigravity/skills, resolveSkillsDir 仍应选 .gemini/config/skills
    await mkdir(path.join(w.home, ".antigravity", "skills"), { recursive: true });
    await rm(agDir, { recursive: true, force: true });
    const restored = await restoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(await readFile(path.join(agDir, "SKILL.md"), "utf8")).toContain("antigravity-v1");

    // 空 home(尚未建出 .gemini/config/skills)还原时也应落入 .gemini/config/skills
    const emptyHome = await tmp("skills-hub-ag-empty-home-");
    const restoredEmpty = await restoreClientSkills(w.store, emptyHome, snap.snapshotId);
    expect(restoredEmpty.ok).toBe(true);
    expect(await readFile(path.join(emptyHome, ".gemini", "config", "skills", "zeta", "SKILL.md"), "utf8")).toContain("antigravity-v1");

    // roots 格式包含 config/skills 也能预览与还原
    const rootsId = "2026-08-17T10-00-00.000Z-ag-roots";
    const snapDir = path.join(w.store, STORE_BACKUPS_DIR, rootsId);
    const oldSrc = path.join(snapDir, "roots", "antigravity", ".gemini", "config", "skills", "theta");
    await mkdir(oldSrc, { recursive: true });
    await writeFile(path.join(oldSrc, "SKILL.md"), "---\nname: theta\ndescription: t\n---\nfrom-roots\n");
    await writeFile(path.join(snapDir, "manifest.json"), JSON.stringify({
      snapshotId: rootsId,
      createdAt: "2026-08-17T10:00:00.000Z",
      clientRoots: 1,
      skillDirs: 1,
    }) + "\n");
    const resRoots = await restoreClientSkills(w.store, w.home, rootsId);
    expect(resRoots.ok).toBe(true);
    if (!resRoots.ok) return;
    expect(await readFile(path.join(w.home, ".gemini", "config", "skills", "theta", "SKILL.md"), "utf8")).toContain("from-roots");
  });

  it("Issue #159 回归: 普通目录 + 预占旁路目录 + 连续两次 restoreClientSkills 均成功且不碰撞", async () => {
    const w = await world();
    const snap = await createBackupSnapshot(w.store, w.home);

    // 预占基础 aside 路径(store tmp 与局部旁路)
    await mkdir(path.join(w.store, STORE_TMP_DIR, "restore-aside-" + snap.snapshotId, "claude-alpha"), { recursive: true });
    await mkdir(path.join(w.home, ".claude", ".skills-hub.restore-aside", snap.snapshotId, "claude-alpha"), { recursive: true });

    // 第 1 次还原:普通目录被改写
    await writeFile(path.join(w.skillA, "SKILL.md"), "---\nname: shared\ndescription: d\n---\nrun-1-edited\n");
    const run1 = await restoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(run1.ok).toBe(true);
    if (!run1.ok) return;
    expect(await readFile(path.join(w.skillA, "SKILL.md"), "utf8")).toContain("same-bytes");
    expect(run1.asideDir).not.toBe(path.join(w.store, STORE_TMP_DIR, "restore-aside-" + snap.snapshotId));

    // 第 2 次还原(同一快照连续执行):再次改写后仍成功且使用不同 runId
    await writeFile(path.join(w.skillA, "SKILL.md"), "---\nname: shared\ndescription: d\n---\nrun-2-edited\n");
    const run2 = await restoreClientSkills(w.store, w.home, snap.snapshotId);
    expect(run2.ok).toBe(true);
    if (!run2.ok) return;
    expect(run2.asideDir).not.toBe(run1.asideDir);
    expect(await readFile(path.join(w.skillA, "SKILL.md"), "utf8")).toContain("same-bytes");
  });

  it("Issue #159: asideSkill 在 EPERM/EXDEV 时回退到 localAside 重试与 cp+unlinkNoFollow, 彻底锁定则报错指明路径", async () => {
    const base = await tmp("skills-hub-aside-fallback-");
    const storeAside = path.join(base, "store", "tmp", "restore-aside-r1");
    const localAside = path.join(base, "home", ".claude", ".skills-hub.restore-aside", "r1");

    // 1. storeDest 报 EXDEV → 回退到 localAside rename
    const src1 = path.join(base, "home", ".claude", "skills", "s1");
    await mkdir(src1, { recursive: true });
    await writeFile(path.join(src1, "SKILL.md"), "s1-data");
    const { rename: fsRename } = await import("node:fs/promises");
    await asideSkill(src1, storeAside, localAside, "claude-s1", {
      retryDelayMs: 1,
      renameFn: async (oldP, newP) => {
        if (newP.startsWith(storeAside)) {
          const err = new Error("EXDEV") as NodeJS.ErrnoException;
          err.code = "EXDEV";
          throw err;
        }
        await fsRename(oldP, newP);
      },
    });
    expect(await existsSafe(src1)).toBe(false);
    expect(await readFile(path.join(localAside, "claude-s1", "SKILL.md"), "utf8")).toBe("s1-data");

    // 2. rename 持续报 EPERM → 短重试后回退到 cp(localDest) + unlinkNoFollow(src), 内部目录与嵌套链接不跟随
    const src2 = path.join(base, "home", ".claude", "skills", "s2");
    const sub2 = path.join(src2, "sub");
    const extTarget = path.join(base, "external-target");
    await mkdir(sub2, { recursive: true });
    await mkdir(extTarget, { recursive: true });
    await writeFile(path.join(sub2, "note.md"), "s2-sub");
    await writeFile(path.join(extTarget, "keep.txt"), "must-survive");
    try {
      await symlink(extTarget, path.join(src2, "nested-link"), process.platform === "win32" ? "junction" : "dir");
    } catch {
      /* 无权限则仅测普通嵌套目录 */
    }
    // 预占一次 claude-s2 验证防碰撞命名
    await mkdir(path.join(localAside, "claude-s2"), { recursive: true });
    let renameCalls = 0;
    await asideSkill(src2, storeAside, localAside, "claude-s2", {
      retryDelayMs: 1,
      renameFn: async () => {
        renameCalls++;
        const err = new Error("EPERM") as NodeJS.ErrnoException;
        err.code = "EPERM";
        throw err;
      },
    });
    // 1 次 store + 1 次 local + 2 次重试 = 4 次 rename 尝试
    expect(renameCalls).toBe(4);
    expect(await existsSafe(src2)).toBe(false);
    expect(await readFile(path.join(localAside, "claude-s2-1", "sub", "note.md"), "utf8")).toBe("s2-sub");
    expect(await readFile(path.join(extTarget, "keep.txt"), "utf8")).toBe("must-survive");

    // 3. rename 与 unlinkNoFollow 均被锁定 → 抛错含精确 src 路径和 IDE/终端锁定提示, 且原内容仍在
    const src3 = path.join(base, "home", ".claude", "skills", "s3");
    await mkdir(src3, { recursive: true });
    await writeFile(path.join(src3, "SKILL.md"), "locked");
    await expect(
      asideSkill(src3, storeAside, localAside, "claude-s3", {
        retryDelayMs: 1,
        renameFn: async () => {
          const err = new Error("EPERM") as NodeJS.ErrnoException;
          err.code = "EPERM";
          throw err;
        },
        unlinkFn: async () => {
          const err = new Error("EBUSY") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        },
      }),
    ).rejects.toThrow(src3);
    expect(await readFile(path.join(src3, "SKILL.md"), "utf8")).toBe("locked");
    // 验证 unlinkNoFollow 对嵌套普通目录自身可正常工作
    await unlinkNoFollow(src3);
    expect(await existsSafe(src3)).toBe(false);
  });
});

async function existsSafe(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}
