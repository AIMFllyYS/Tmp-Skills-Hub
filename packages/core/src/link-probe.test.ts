import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findDanglingLinks, probeLinkTypes } from "./link-probe.js";

/**
 * 链接探测与悬空链接检测(doctor 数据来源)。全部在系统临时目录进行。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-probe-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("probeLinkTypes", () => {
  it("返回三种链接类型的可用性,且不留下探测残留", async () => {
    const work = await tmp();
    const result = await probeLinkTypes(work);
    expect(typeof result.junction).toBe("boolean");
    expect(typeof result.symlink).toBe("boolean");
    expect(typeof result.hardlink).toBe("boolean");
    // 探测目录与目标目录都被清理
    expect(await readdir(work)).toEqual([]);
  });
});

describe("findDanglingLinks", () => {
  it("目标存在的链接不算悬空,目标缺失的算", async () => {
    const work = await tmp();
    const store = path.join(work, "store");
    await mkdir(store, { recursive: true });
    const root = path.join(work, "root");
    await mkdir(root, { recursive: true });
    // 有效链接
    await symlink(store, path.join(root, "good"), "junction");
    // 悬空链接
    await symlink(path.join(work, "missing-target"), path.join(root, "dangling"), "junction");

    const result = await findDanglingLinks([root]);
    expect(result).toHaveLength(1);
    expect(result[0]!.linkPath).toContain("dangling");
    expect(result[0]!.target).toContain("missing-target");
  });

  it("普通文件与目录不误报", async () => {
    const work = await tmp();
    const root = path.join(work, "root");
    await mkdir(root, { recursive: true });
    await mkdir(path.join(root, "plain-dir"));
    await writeFile(path.join(root, "plain-file.txt"), "x");

    expect(await findDanglingLinks([root])).toEqual([]);
  });
});
