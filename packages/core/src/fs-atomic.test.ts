import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { computeDirDiskUsage, moveDirSafe, writeFileAtomicSafe } from "./fs-atomic.js";

let space: string;

beforeEach(async () => {
  space = await mkdtemp(path.join(os.tmpdir(), "hub-fs-test-"));
});

afterEach(async () => {
  await rm(space, { recursive: true, force: true });
});

const crossDeviceRename: typeof rename = async () => {
  throw Object.assign(new Error("Cross-device rename"), { code: "EXDEV" });
};

it("falls back on EXDEV and verifies nested files and links without following the links", async () => {
  const source = path.join(space, "src");
  const dest = path.join(space, "dst");
  const outside = path.join(space, "outside");
  await mkdir(path.join(source, "empty"), { recursive: true });
  await mkdir(outside);
  const data = Uint8Array.of(9, 0, 0xff);
  await writeFile(path.join(source, "data"), data);
  await writeFile(path.join(outside, "sentinel"), "outside");
  await symlink(outside, path.join(source, "alias"), process.platform === "win32" ? "junction" : "dir");
  expect(await computeDirDiskUsage(source)).toEqual({ bytes: 3, files: 1 });
  await moveDirSafe(source, dest, { renameFn: crossDeviceRename });
  expect(await readdir(space)).toEqual(["dst", "outside"]);
  expect(await readdir(dest)).toEqual(["alias", "data", "empty"]);
  expect([...await readFile(path.join(dest, "data"))]).toEqual([...data]);
  expect(await realpath(path.join(dest, "alias"))).toBe(await realpath(outside));
  await expect(readFile(path.join(outside, "sentinel"), "utf8")).resolves.toBe("outside");
});

it("leaves the source intact when the destination appears during a cross-device move", async () => {
  const source = path.join(space, "src");
  const dest = path.join(space, "dst");
  await mkdir(source);
  await writeFile(path.join(source, "data"), "keep");
  await expect(moveDirSafe(source, dest, {
    renameFn: async () => {
      await mkdir(dest);
      await writeFile(path.join(dest, "existing"), "keep too");
      await crossDeviceRename(source, dest);
    },
  })).rejects.toThrow("目标已存在");
  await expect(readFile(path.join(source, "data"), "utf8")).resolves.toBe("keep");
  await expect(readFile(path.join(dest, "existing"), "utf8")).resolves.toBe("keep too");
  expect(await readdir(space)).toEqual(["dst", "src"]);
});

it("cleans temporary files after a failed atomic replacement", async () => {
  const occupied = path.join(space, "occupied");
  await mkdir(occupied);
  await expect(writeFileAtomicSafe(occupied, "data")).rejects.toThrow();
  expect(await readdir(space)).toEqual(["occupied"]);
  const target = path.join(space, "target");
  await writeFileAtomicSafe(target, "first");
  await writeFileAtomicSafe(target, "second");
  await expect(readFile(target, "utf8")).resolves.toBe("second");
});
