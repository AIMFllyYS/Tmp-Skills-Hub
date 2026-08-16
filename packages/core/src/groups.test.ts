import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSkillToGroups,
  BUILTIN_GROUPS,
  ensureBuiltinGroups,
  groupsOfSkill,
  readGroups,
  removeSkillFromGroups,
  skillsOfGroup,
} from "./groups.js";
import { STORE_TMP_DIR } from "./store-layout.js";

/**
 * 分组模型与内置分组(#25):持久化位置、多分组、初始化写入不被覆盖、
 * 变更不移动文件、原子写。全部沙箱。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-groups-test-"));
  tempDirs.push(dir);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(dir, STORE_TMP_DIR), { recursive: true }));
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("groups(#25)", () => {
  it("缺失/占位 {} → 空分组;内置分组写入后立即可读", async () => {
    const dir = await tmp();
    expect((await readGroups(dir)).groups).toEqual([]);
    await writeFile(path.join(dir, "groups.json"), "{}\n");
    expect((await readGroups(dir)).groups).toEqual([]);
    const r = await ensureBuiltinGroups(dir);
    expect(r.wrote).toBe(true);
    const g = await readGroups(dir);
    expect(g.groups.map((x) => x.id)).toEqual(["development", "design", "tooling", "writing", "research"]);
    expect(BUILTIN_GROUPS).toHaveLength(5);
  });

  it("用户修改后 ensureBuiltinGroups 不覆盖", async () => {
    const dir = await tmp();
    await ensureBuiltinGroups(dir);
    // 用户改名 + 清空一个分组
    const g = await readGroups(dir);
    g.groups[0]!.name = "我改的名字";
    g.groups[1]!.memberHashes = [];
    g.groups = g.groups.filter((x) => x.id !== "research");
    await writeFile(path.join(dir, "groups.json"), JSON.stringify(g));
    const r = await ensureBuiltinGroups(dir);
    expect(r.wrote).toBe(false);
    const after = await readGroups(dir);
    expect(after.groups[0]!.name).toBe("我改的名字");
    expect(after.groups.map((x) => x.id)).not.toContain("research");
  });

  it("一个 skill 可属于多个分组;成员按哈希记录;查询双向", async () => {
    const dir = await tmp();
    await ensureBuiltinGroups(dir);
    const changed = await addSkillToGroups(dir, "hash-abc", ["development", "tooling", "design"]);
    expect(changed).toBe(3);
    const g = await readGroups(dir);
    expect(groupsOfSkill(g, "hash-abc").sort()).toEqual(["design", "development", "tooling"]);
    expect(skillsOfGroup(g, "development")).toEqual(["hash-abc"]);
    expect(skillsOfGroup(g, "research")).toEqual([]);
    // 幂等:重复加入不重复计数
    expect(await addSkillToGroups(dir, "hash-abc", ["development"])).toBe(0);
    // 移出
    expect(await removeSkillFromGroups(dir, "hash-abc", ["development", "nope"])).toBe(1);
    expect(groupsOfSkill(await readGroups(dir), "hash-abc").sort()).toEqual(["design", "tooling"]);
  });

  it("分组变更不移动库存任何文件(仅改 groups.json)", async () => {
    const dir = await tmp();
    await ensureBuiltinGroups(dir);
    await addSkillToGroups(dir, "hash-abc", ["development"]);
    const files = (await import("node:fs/promises")).readdir;
    // 库存里放一个 skill 目录,分组操作后原样
    const skillDir = path.join(dir, "skills", "demo");
    await (await import("node:fs/promises")).mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "x");
    const before = (await files(dir)).sort();
    await removeSkillFromGroups(dir, "hash-abc", ["development"]);
    expect(await readFile(path.join(skillDir, "SKILL.md"), "utf8")).toBe("x");
    const after = (await files(dir)).sort();
    expect(after).toEqual(before);
  });

  it("原子写:写入后文件内容结构完整;损坏抛错不静默重置", async () => {
    const dir = await tmp();
    await ensureBuiltinGroups(dir);
    await addSkillToGroups(dir, "h1", ["development"]);
    const raw = await readFile(path.join(dir, "groups.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.groups.find((x: { id: string }) => x.id === "development").memberHashes).toEqual(["h1"]);
    await writeFile(path.join(dir, "groups.json"), "not json");
    await expect(readGroups(dir)).rejects.toThrow(/损坏/);
  });
});
