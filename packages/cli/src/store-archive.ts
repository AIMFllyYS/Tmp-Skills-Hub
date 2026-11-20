import path from "node:path";
import { normalizeHubPaths } from "@skills-hub/core";
import {
  archiveSkill,
  listArchivedSkills,
  readStoreIndex,
  restoreArchivedSkill,
  STORE_ARCHIVE_DIR,
} from "@skills-hub/core";
import { emitError, emitOk } from "./json-out.js";
import { resolveNames } from "./resolve-skill.js";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-shared.js";

export interface ArchiveArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runArchive(args: ArchiveArgs): Promise<void> {
  const names = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  const storeRoot = await resolveStoreRootOrFail(args, "archive");
  if (storeRoot === null) return;

  if (names[0] === "restore") {
    const targets = names.slice(1);
    if (targets.length === 0) {
      emitError(args.json === true, "archive", "bad-usage", "用法: skills-hub archive restore <name>");
      return;
    }
    const dryRun = args.dryRun === true;
    if (!dryRun && !requireWriteAuth(args, "archive")) return;
    if (dryRun) {
      if (args.json) emitOk("archive", { verb: "restore", dryRun: true, names: targets });
      else {
        console.log("预演(不写盘):");
        for (const n of targets) console.log("  将恢复: " + n);
      }
      return;
    }
    let failed = 0;
    const results: unknown[] = [];
    for (const n of targets) {
      const res = await restoreArchivedSkill(storeRoot, n);
      if (res.ok) {
        results.push({ name: n, ok: true, hash: res.hash, archiveFile: res.archiveFile });
        if (!args.json) console.log("✓ 已恢复: " + res.dirName + " (" + res.hash.slice(0, 12) + ")");
      } else {
        failed++;
        results.push({ name: n, ok: false, code: res.code, message: res.message });
        console.error("✗ 恢复失败: " + n + " — " + res.message);
      }
    }
    if (args.json) emitOk("archive", { verb: "restore", results, failed });
    if (failed > 0) process.exitCode = 2;
    return;
  }

  // 无参数:列出归档区(可被列出与定位)
  if (names.length === 0) {
    const archived = await listArchivedSkills(storeRoot);
    if (args.json) {
      emitOk("archive", { verb: "list", archiveDir: path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_ARCHIVE_DIR), archived });
      return;
    }
    if (archived.length === 0) {
      console.log("归档区为空: " + path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_ARCHIVE_DIR));
      return;
    }
    console.log("归档区(" + archived.length + "): " + path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_ARCHIVE_DIR));
    for (const a of archived) console.log("  " + a.name + "  " + a.sizeBytes + " B  " + a.file);
    return;
  }

  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "archive")) return;
  const skills = await readStoreIndex(storeRoot);
  let dirNames: string[];
  try {
    dirNames = names.flatMap((n) => resolveNames(n, skills));
  } catch (e) {
    emitError(args.json === true, "archive", "not-found", e instanceof Error ? e.message : String(e));
    return;
  }

  if (dryRun) {
    const plan = dirNames.map((n) => ({
      dirName: n,
      action: "归档:打包成 zip 移入归档区,先摘全部受管链接,原件不删除",
    }));
    if (args.json) emitOk("archive", { dryRun: true, plan });
    else {
      console.log("预演(不写盘):");
      for (const p of plan) console.log("  " + p.dirName + " — " + p.action);
    }
    return;
  }

  const results: unknown[] = [];
  let failed = 0;
  for (const dirName of dirNames) {
    const res = await archiveSkill(storeRoot, dirName);
    if (res.ok) {
      results.push({ dirName, ok: true, archiveFile: res.archiveFile, sizeBytes: res.sizeBytes, removedLinks: res.removedLinks });
      if (!args.json) console.log("✓ 已归档: " + dirName + " → " + res.archiveFile + " (" + res.removedLinks + " 个链接已摘)");
    } else {
      failed++;
      results.push({ dirName, ok: false, code: res.code, message: res.message });
      console.error("✗ 归档失败: " + dirName + " — " + res.message);
    }
  }
  if (args.json) {
    emitOk("archive", { archiveDir: path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_ARCHIVE_DIR), results, failed });
  } else {
    console.log("归档完成:" + (dirNames.length - failed) + " 成功 / " + failed + " 失败。");
    console.log("本工具没有真删除。如需彻底删除,请自行处理归档区文件:" + path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_ARCHIVE_DIR));
  }
  if (failed > 0) process.exitCode = 2;
}
