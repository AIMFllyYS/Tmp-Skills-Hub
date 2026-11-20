import path from "node:path";
import {
  discoverClientRoots,
  discoverClientRootsAt,
  readGroups,
  readStoreIndex,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { performLinkChange, previewLinkChange, type LinkChangeRequest } from "./link-actions.js";
import { resolveNames } from "./resolve-skill.js";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-shared.js";

export { resolveNames, resolveSkill } from "./resolve-skill.js";
export type { ResolveSkillFailure, ResolveSkillResult } from "./resolve-skill.js";
export {
  performInit,
  POINTER_REL,
  requireWriteAuth,
  resolveStoreRootOrFail,
  writePointerFile,
} from "./store-shared.js";
export type { PerformInitFailure, PerformInitResult } from "./store-shared.js";
export { performAdopt, printAdoptSummary, runAdopt } from "./store-adopt.js";
export type { AdoptArgs, AdoptOutcomeJson, AdoptPerformResult } from "./store-adopt.js";
export { performVerify, runList, runShow, runVerify } from "./store-query.js";
export type { ListArgs, ShowArgs, VerifyArgs, VerifyDrift, VerifyMissing, VerifyReport } from "./store-query.js";
export { runArchive } from "./store-archive.js";
export type { ArchiveArgs } from "./store-archive.js";

// ============ enable / disable(#22):受管链接集合的 CLI 入口 ============

export interface LinkCmdArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  client: string | undefined;
  /** global(默认,home 下)/ project(cwd 下) */
  scope: string | undefined;
  /** 按分组批量操作(--group <id>,与按名互斥) */
  group: string | undefined;
  _: (string | number)[];
}

/** 解析目标客户端 skills 根。默认行为:未指定 --client 时报错并列出可用客户端,绝不猜默认写入对象。 */
export async function resolveClientSkillsDir(
  args: LinkCmdArgs,
  command: "enable" | "disable" = "enable",
): Promise<{ clientId: string; skillsDir: string } | null> {
  const scope = args.scope === "project" ? "project" : "global";
  const base = scope === "project" ? process.cwd() : resolveHome(args.home);
  const roots = scope === "project" ? await discoverClientRootsAt(base) : await discoverClientRoots(base);
  if (args.client === undefined || args.client === "") {
    const list = roots.length > 0 ? roots.map((r) => r.clientId).join(", ") : "(无)";
    emitError(
      args.json === true,
      command,
      "bad-usage",
      "未指定 --client。可用客户端(" + scope + "侧): " + list + "\n默认行为:未指定 --client 时报错并列出可用客户端,绝不猜默认写入对象。",
    );
    return null;
  }
  const root = roots.find((r) => r.clientId === args.client);
  if (root === undefined) {
    const list = roots.length > 0 ? roots.map((r) => r.clientId).join(", ") : "(无)";
    emitError(args.json === true, command, "not-found", "未找到客户端 " + args.client + "(" + scope + "侧)。可用: " + list);
    return null;
  }
  return { clientId: root.clientId, skillsDir: root.skillsDir };
}

/** 解析操作目标:按名或按分组(二选一,互斥校验)。返回 dirName 列表。 */
async function resolveLinkTargets(
  args: LinkCmdArgs,
  skills: Awaited<ReturnType<typeof readStoreIndex>>,
  storeRoot: string,
  command: "enable" | "disable",
): Promise<string[] | null> {
  const names = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  const groupId = args.group;
  if (names.length > 0 && groupId !== undefined) {
    emitError(args.json === true, command, "bad-usage", "enable/disable 不能同时按名与按分组(--group),请二选一。");
    return null;
  }
  if (groupId !== undefined) {
    const groups = await readGroups(storeRoot);
    const g = groups.groups.find((x) => x.id === groupId);
    if (g === undefined) {
      emitError(args.json === true, command, "group-not-found", "分组不存在: " + groupId + "。skills-hub group list 查看。");
      return null;
    }
    const memberHashes = new Set(g.memberHashes);
    const dirNames = skills.filter((s) => memberHashes.has(s.hash)).map((s) => s.dirName);
    if (dirNames.length === 0) {
      emitError(args.json === true, command, "group-empty", "分组 " + groupId + " 里没有 skill。先 skills-hub group add <id> <skill名...> 加入。");
      return null;
    }
    return dirNames;
  }
  if (names.length === 0) {
    emitError(args.json === true, command, "bad-usage", "用法: skills-hub enable <skill名或哈希前缀...> --client <id> [--group <id>] [--scope global|project] [--yes] [--dry-run]");
    return null;
  }
  try {
    return names.flatMap((n) => resolveNames(n, skills));
  } catch (e) {
    emitError(args.json === true, command, "not-found", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function runEnable(args: LinkCmdArgs): Promise<void> {
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "enable")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "enable");
  if (storeRoot === null) return;
  const client = await resolveClientSkillsDir(args, "enable");
  if (client === null) return;
  const scope = args.scope === "project" ? "project" : "global";

  const skills = await readStoreIndex(storeRoot);
  const dirNames = await resolveLinkTargets(args, skills, storeRoot, "enable");
  if (dirNames === null) return;

  const req: LinkChangeRequest = { storeRoot, clientId: client.clientId, scope, skillsDir: client.skillsDir, dirNames };

  if (dryRun) {
    const preview = await previewLinkChange(req, "enable");
    const wouldCreate = preview.wouldCreate.map((e) => e.dirName);
    const wouldRemove = preview.wouldRemove.map((e) => e.dirName);
    if (args.json) emitOk("enable", { dryRun: true, clientId: client.clientId, scope, targetDir: client.skillsDir, wouldCreate, wouldRemove });
    else {
      console.log("预演(不写盘):");
      for (const n of wouldCreate) console.log("  将建立链接: " + n + " → " + client.skillsDir);
      for (const n of wouldRemove) console.log("  将摘除链接: " + n);
      for (const x of preview.conflicts) console.log("  冲突: " + x.dirName + " — " + x.reason);
      if (wouldCreate.length === 0 && wouldRemove.length === 0 && preview.conflicts.length === 0) console.log("  无变更");
    }
    return;
  }

  const result = await performLinkChange(req, "enable");
  if (!result.ok) {
    emitError(args.json === true, "enable", result.code, "enable 失败: " + result.message);
    return;
  }
  if (args.json) {
    emitOk("enable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: result.created, removed: result.removed });
    return;
  }
  for (const p of result.created) console.log("✓ 已启用: " + path.basename(p) + " → " + client.skillsDir);
  for (const p of result.removed) console.log("  (更新:摘除旧链接 " + path.basename(p) + ")");
  console.log("enable 完成,共 " + result.created.length + " 个。" + (result.removed.length > 0 ? "(顺带清理 " + result.removed.length + " 个旧链接)" : ""));
}

export async function runDisable(args: LinkCmdArgs): Promise<void> {
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "disable")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "disable");
  if (storeRoot === null) return;
  const client = await resolveClientSkillsDir(args, "disable");
  if (client === null) return;
  const scope = args.scope === "project" ? "project" : "global";

  const skills = await readStoreIndex(storeRoot);
  const dirNames = await resolveLinkTargets(args, skills, storeRoot, "disable");
  if (dirNames === null) return;

  const req: LinkChangeRequest = { storeRoot, clientId: client.clientId, scope, skillsDir: client.skillsDir, dirNames };

  if (dryRun) {
    const preview = await previewLinkChange(req, "disable");
    const wouldRemove = preview.wouldRemove.map((e) => e.dirName);
    if (args.json) emitOk("disable", { dryRun: true, clientId: client.clientId, scope, targetDir: client.skillsDir, wouldRemove });
    else {
      console.log("预演(不写盘):");
      for (const n of wouldRemove) console.log("  将摘除链接: " + n + "(原件保留在库存)");
      for (const x of preview.conflicts) console.log("  冲突: " + x.dirName + " — " + x.reason);
      if (wouldRemove.length === 0 && preview.conflicts.length === 0) console.log("  无变更(这些 skill 未在此客户端启用)");
    }
    return;
  }

  const result = await performLinkChange(req, "disable");
  if (result.ok && result.created.length === 0 && result.removed.length === 0) {
    if (args.json) emitOk("disable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: [], removed: [], unchanged: dirNames });
    else console.log("未变更:这些 skill 未在 " + client.clientId + " 启用(原件保留在库存)。");
    return;
  }
  if (!result.ok) {
    emitError(args.json === true, "disable", result.code, "disable 失败: " + result.message);
    return;
  }
  if (args.json) {
    emitOk("disable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: result.created, removed: result.removed });
    return;
  }
  for (const p of result.removed) console.log("✓ 已禁用(摘除链接): " + path.basename(p));
  console.log("disable 完成,摘除 " + result.removed.length + " 个链接。库存原件一个字节未动。" + (result.created.length > 0 ? "(顺带建立 " + result.created.length + " 个新链接)" : ""));
}
