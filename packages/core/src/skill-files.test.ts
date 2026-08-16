import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { listSkillFiles, readSkillFile } from "./skill-files.js";

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((d) => rm(d, { recursive: true, force: true })));
});

async function makeSkill(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-files-"));
  roots.push(dir);
  await writeFile(path.join(dir, "SKILL.md"), "# demo\n\nbody\n", "utf8");
  await mkdir(path.join(dir, "references"));
  await writeFile(path.join(dir, "references", "guide.md"), "guide\n", "utf8");
  await writeFile(path.join(dir, "scripts", "run.ps1"), "echo hi\n", "utf8").catch(() => {});
  await mkdir(path.join(dir, "scripts"));
  await writeFile(path.join(dir, "scripts", "run.ps1"), "echo hi\n", "utf8");
  return dir;
}

describe("skill-files", () => {
  it("文件树:目录在前、POSIX 路径、按路径排序", async () => {
    const dir = await makeSkill();
    const res = await listSkillFiles(dir);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const paths = res.entries.map((e) => e.path);
    expect(paths).toContain("SKILL.md");
    expect(paths).toContain("references");
    expect(paths).toContain("references/guide.md");
    expect(paths).toContain("scripts/run.ps1");
    expect(res.entries[0]?.kind).toBe("dir");
  });

  it("读取文本文件内容", async () => {
    const dir = await makeSkill();
    const res = await readSkillFile(dir, "SKILL.md");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toContain("# demo");
  });

  it("路径穿越被拒绝(outside)", async () => {
    const dir = await makeSkill();
    const res = await readSkillFile(dir, "..\\..\\secret.txt");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("outside");
  });

  it("不存在 → not-found", async () => {
    const dir = await makeSkill();
    const res = await readSkillFile(dir, "nope.md");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not-found");
  });

  it("二进制(含 NUL)→ binary 降级", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-files-bin-"));
    roots.push(dir);
    await writeFile(path.join(dir, "blob.bin"), Buffer.from([0x00, 0x01, 0x02]));
    const res = await readSkillFile(dir, "blob.bin");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("binary");
  });

  it("大文件 → too-large 降级", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-files-big-"));
    roots.push(dir);
    await writeFile(path.join(dir, "big.md"), "x".repeat(600 * 1024), "utf8");
    const res = await readSkillFile(dir, "big.md");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("too-large");
  });
});
