import { mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyClientLink } from "./link-status.js";
import { rm } from "node:fs/promises";

const trash: string[] = [];

afterEach(async () => {
  await Promise.all(trash.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), "skills-hub-link-status-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  await mkdir(dir, { recursive: true });
  trash.push(dir);
  return dir;
}

describe("classifyClientLink", () => {
  it("无落点且无台账 → off", async () => {
    const dir = await tmp();
    const r = await classifyClientLink(path.join(dir, "missing"), false);
    expect(r.state).toBe("off");
  });

  it("无落点但台账有 → dangling", async () => {
    const dir = await tmp();
    const r = await classifyClientLink(path.join(dir, "missing"), true);
    expect(r.state).toBe("dangling");
  });

  it("用户文件夹占名 → unregistered-conflict", async () => {
    const dir = await tmp();
    const dest = path.join(dir, "demo");
    await mkdir(dest);
    await writeFile(path.join(dest, "SKILL.md"), "x", "utf8");
    const r = await classifyClientLink(dest, false);
    expect(r.state).toBe("unregistered-conflict");
  });

  it("受管链接且目标在 → managed", async () => {
    const dir = await tmp();
    const target = path.join(dir, "real");
    await mkdir(target);
    const dest = path.join(dir, "demo");
    await symlink(target, dest, "junction");
    const r = await classifyClientLink(dest, true);
    expect(r.state).toBe("managed");
  });
});
