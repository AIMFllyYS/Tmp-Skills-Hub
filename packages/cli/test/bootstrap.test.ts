import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBootstrap } from "../src/bootstrap.js";

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

afterEach(async () => {
  for (const dir of tempRoots.splice(0)) {
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true });
  }
  process.exitCode = 0;
});

function answers(seq: string[]): (p: string) => Promise<string> {
  let i = 0;
  const called: string[] = [];
  const fn = async (p: string): Promise<string> => { called.push(p); return seq[i++] ?? ""; };
  return Object.assign(fn, { called });
}

describe("runBootstrap", () => {
  it("全流程:默认路径 + 备份 Y + 迁移 Y → 备份目录/库存/收录齐全", async () => {
    const home = await newHome();
    const ask = answers(["", "Y", "Y"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    const store = home; // --home 语义直通
    // 指针 + 布局
    const pointer = JSON.parse(await readFile(path.join(store, ".skills-hub", "config.json"), "utf8")) as { storeRoot: string };
    expect(pointer.storeRoot).toBe(store);
    const skills = await import("node:fs/promises").then((m) => m.readdir(path.join(store, "skills")));
    expect(skills).toContain("sample-a");
    expect(skills).toContain("sample-b");
    // 备份快照
    const backups = await import("node:fs/promises").then((m) => m.readdir(path.join(store, "backups")));
    expect(backups.length).toBe(1);
    const snap = path.join(store, "backups", backups[0]!);
    await expect(readFile(path.join(snap, "manifest.json"), "utf8")).resolves.toContain('"skillDirs": 2');
    await expect(
      readFile(path.join(snap, "roots", "claude", ".claude", "skills", "sample-a", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: sample-a");
    expect(ask.called.length).toBe(3);
  });

  it("备份确认 N:跳过备份,仍迁移", async () => {
    const home = await newHome();
    const ask = answers(["", "N", "Y"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    const backupsDir = path.join(home, "backups");
    await expect(import("node:fs/promises").then((m) => m.readdir(backupsDir))).rejects.toThrow();
    const skills = await import("node:fs/promises").then((m) => m.readdir(path.join(home, "skills")));
    expect(skills.length).toBe(2);
  });

  it("迁移确认 N:取消,不做任何改动", async () => {
    const home = await newHome();
    const ask = answers(["", "Y", "N"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    await expect(import("node:fs/promises").then((m) => m.readFile(path.join(home, ".skills-hub", "config.json"), "utf8"))).rejects.toThrow();
  });

  it("幂等:库存已就绪时零交互,直接返回", async () => {
    const home = await newHome();
    await runBootstrap({ home }, { readLine: answers(["", "Y", "Y"]) as never, ui: false });
    const ask2 = answers(["should-not-be-called"]);
    await runBootstrap({ home }, { readLine: ask2 as never, ui: false });
    expect(ask2.called.length).toBe(0);
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
    const ask = answers([storeRoot, "N", "Y"]);
    await runBootstrap({ home }, {
      readLine: ask as never,
      ui: async (opts) => {
        captured.push(opts);
      },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.home).toBe(home);
    expect(captured[0]!.home).not.toBe(path.resolve(storeRoot));
    const pointer = JSON.parse(await readFile(path.join(home, ".skills-hub", "config.json"), "utf8")) as { storeRoot: string };
    expect(pointer.storeRoot).toBe(path.resolve(storeRoot));
    expect(captured[0]!.home).not.toBe(pointer.storeRoot);
  });

  it("备份跟随链接复制内容(客户端目录含 junction 时不炸,内容完整)", async () => {
    const home = await newHome();
    // 真实世界形态:.claude/skills 下挂一个指向别处的链接(本项目 enable 即生产这种链接)
    const realDir = path.join(home, ".agents", "skills", "linked-skill");
    await mkdir(realDir, { recursive: true });
    await writeFile(path.join(realDir, "SKILL.md"), ["---", "name: linked-skill", "description: linked test skill", "---", "", "# linked"].join("\n") + "\n", "utf8");
    await symlink(realDir, path.join(home, ".claude", "skills", "linked-skill"), "junction");
    // 悬空链接:目标已删除(真实机器上 .continue/skills/agent-onboarding 即此形态)
    await symlink(path.join(home, ".agents", "skills", "ghost"), path.join(home, ".claude", "skills", "dangling-skill"), "junction");
    const ask = answers(["", "Y", "Y"]);
    await runBootstrap({ home }, { readLine: ask as never, ui: false });
    // 链接内容被复制(而非尝试重建链接 → Windows EPERM)
    const backups = await import("node:fs/promises").then((m) => m.readdir(path.join(home, "backups")));
    const snap = path.join(home, "backups", backups[0]!);
    await expect(
      readFile(path.join(snap, "roots", "claude", ".claude", "skills", "linked-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: linked-skill");
  });
});
