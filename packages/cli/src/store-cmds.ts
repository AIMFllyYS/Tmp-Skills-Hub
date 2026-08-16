import path from "node:path";
import {
  adoptMany,
  applyLinkSet,
  archiveSkill,
  discoverClientRoots,
  discoverClientRootsAt,
  hashSkillFolder,
  listArchivedSkills,
  readGroups,
  readLinksLedger,
  readStoreIndex,
  resolveStoreRoot,
  STORE_ARCHIVE_DIR,
  STORE_SKILLS_DIR,
  writeStoreIndex,
  type AdoptInput,
  type LinkEntry,
  type SkillRecord,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";

export const POINTER_REL = path.join(".skills-hub", "config.json");

/** 解析库存位置;未配置时输出契约失败信封并返回 null(退出码 2 由 helper 设置)。 */
export async function resolveStoreRootOrFail(args: { home: string | undefined; json: boolean | undefined }, command: string): Promise<string | null> {
  const home = resolveHome(args.home);
  const opts: StoreRootOptions = { pointerFilePath: path.join(home, POINTER_REL) };
  if (args.home !== undefined && args.home !== "") opts.cliHome = args.home;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") opts.envHome = envHome;
  const store = await resolveStoreRoot(opts);
  if (!store.ok) {
    emitError(args.json === true, command, "store-not-configured", "库存未配置:" + store.message + " — 请先运行 skills-hub init --home <path> --yes");
    return null;
  }
  return store.storeRoot;
}

/** 写操作授权铁律(cli-commands-v0.md §2):非交互环境必须显式 --yes。 */
export function requireWriteAuth(args: { yes: boolean | undefined; json: boolean | undefined }, command: string): boolean {
  if (process.stdin.isTTY || args.yes === true) return true;
  emitError(args.json === true, command, "auth-required", "写操作需要显式授权:非交互环境请加 --yes。");
  return false;
}

export interface AdoptArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runAdopt(args: AdoptArgs): Promise<void> {
  const paths = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (paths.length === 0) {
    console.error("用法: skills-hub adopt <本地skill目录路径> [--yes] [--dry-run]");
    process.exitCode = 2;
    return;
  }
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "adopt")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "adopt");
  if (storeRoot === null) return;

  const inputs: AdoptInput[] = paths.map((p) => ({
    folderPath: path.resolve(p),
    origin: { kind: "local-scan", reference: path.resolve(p) },
  }));
  const report = await adoptMany(storeRoot, inputs, { dryRun });

  if (args.json) {
    emitOk("adopt", {
      dryRun,
      storeRoot,
      outcomes: report.outcomes.map((o) => ({
        kind: o.kind,
        folder: o.kind === "invalid" ? o.folderPath : o.kind === "conflict" ? o.name : o.record.dirName,
        ...(o.kind === "adopted" || o.kind === "duplicate" ? { hash: o.record.hash } : {}),
        ...(o.kind === "conflict" ? { existingHash: o.existingHash, incomingHash: o.incomingHash } : {}),
        ...(o.kind === "invalid" ? { reason: o.reason } : {}),
      })),
      adopted: report.adopted,
      duplicates: report.duplicates,
      conflicts: report.conflicts,
      invalid: report.invalid,
    });
    return;
  }
  for (const o of report.outcomes) {
    if (o.kind === "adopted") console.log("✓ 已收录: " + o.record.dirName + " (" + o.record.hash.slice(0, 12) + ")");
    else if (o.kind === "duplicate") console.log("≈ 已存在(内容相同): " + o.record.dirName + " — 来源已并入记录");
    else if (o.kind === "conflict") console.log("✗ 冲突(同名不同内容): " + o.name + " — 未覆盖,现有哈希 " + o.existingHash.slice(0, 12));
    else console.log("✗ 未收录(缺 name/description): " + o.folderPath);
  }
  console.log((dryRun ? "预演结果" : "收录结果") + `: 新增 ${report.adopted} / 重复 ${report.duplicates} / 冲突 ${report.conflicts} / 未达标 ${report.invalid}`);
}

export interface ListArgs {
  home: string | undefined;
  json: boolean | undefined;
  source: string | undefined;
  enabled: boolean | undefined;
}

export async function runList(args: ListArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "list");
  if (storeRoot === null) return;
  let skills = await readStoreIndex(storeRoot);
  if (args.source !== undefined && args.source !== "") {
    const needle = args.source.toLowerCase();
    skills = skills.filter((s) =>
      s.origins.some((o) => o.kind.toLowerCase() === needle || o.reference.toLowerCase().includes(needle)),
    );
  }
  if (args.enabled === true) {
    skills = skills.filter((s) => s.visibleIn.length > 0);
  }
  if (args.json) {
    emitOk("list", { storeRoot, total: skills.length, skills });
    return;
  }
  if (skills.length === 0) {
    console.log("库存为空" + (args.enabled ? "(启用状态过滤后)" : "") + "。用 skills-hub adopt 收录。");
    return;
  }
  for (const s of skills) {
    const origins = s.origins.map((o) => o.kind).join(",");
    const enabled = s.visibleIn.length > 0 ? " [启用]" : "";
    console.log(s.hash.slice(0, 12) + "  " + s.dirName + "  (来源: " + origins + ")" + enabled);
  }
  console.log("共 " + skills.length + " 个");
}

export interface ShowArgs {
  home: string | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runShow(args: ShowArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "show");
  if (storeRoot === null) return;
  const needle = String(args._[0] ?? "").trim();
  if (needle === "") {
    emitError(args.json === true, "show", "bad-usage", "用法: skills-hub show <skill名或哈希前缀>");
    return;
  }
  const skills = await readStoreIndex(storeRoot);
  const exact = skills.find((s) => s.dirName === needle);
  const byHash = exact === undefined ? skills.filter((s) => s.hash.startsWith(needle.toLowerCase())) : [];
  if (exact === undefined && byHash.length === 0) {
    emitError(args.json === true, "show", "not-found", "未找到: " + needle + "。先 skills-hub list 看有哪些。" + (skills.length === 0 ? "(库存为空)" : ""));
    return;
  }
  const records: SkillRecord[] = exact !== undefined ? [exact] : byHash.slice(0, 10);
  if (args.json) {
    emitOk("show", { storeRoot, matches: records });
    return;
  }
  for (const s of records) {
    console.log("名称: " + s.dirName);
    console.log("哈希: " + s.hash);
    console.log("描述: " + s.meta.description);
    console.log("来源: " + s.origins.map((o) => o.kind + " " + o.reference).join(" | "));
    console.log("入库: " + s.installedAt);
    console.log("启用: " + (s.visibleIn.length > 0 ? s.visibleIn.join(", ") : "未启用"));
    console.log("---");
  }
}

export interface VerifyArgs {
  home: string | undefined;
  json: boolean | undefined;
}

export async function runVerify(args: VerifyArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "verify");
  if (storeRoot === null) return;
  const skills = await readStoreIndex(storeRoot);
  const drifted: { name: string; recordedHash: string; actualHash: string }[] = [];
  const missing: { name: string; recordedHash: string }[] = [];
  const ok: string[] = [];
  for (const s of skills) {
    const dir = path.join(storeRoot, STORE_SKILLS_DIR, s.dirName);
    const actual = await hashSkillFolder(dir).catch(() => null);
    if (actual === null) {
      missing.push({ name: s.dirName, recordedHash: s.hash });
      continue;
    }
    if (actual === s.hash) ok.push(s.dirName);
    else drifted.push({ name: s.dirName, recordedHash: s.hash, actualHash: actual });
  }
  if (args.json) {
    console.log(JSON.stringify({ storeRoot, checked: skills.length, ok, drifted, missing }, null, 2));
    return;
  }
  console.log("校验 " + skills.length + " 个:");
  if (ok.length > 0) console.log("  ✓ " + ok.length + " 个与记录一致");
  for (const d of drifted) console.log("  ! 漂移: " + d.name + " (记录 " + d.recordedHash.slice(0, 12) + " ≠ 实际 " + d.actualHash.slice(0, 12) + ")");
  for (const m of missing) console.log("  ! 缺失: " + m.name + " (目录不存在)");
  if (drifted.length === 0 && missing.length === 0) console.log("全部一致,无漂移。");
  else console.log("发现 " + (drifted.length + missing.length) + " 处漂移/缺失 — verify 不自动改写,如需更新请重新 adopt 或人工处理。");
}

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
export async function resolveClientSkillsDir(args: LinkCmdArgs): Promise<{ clientId: string; skillsDir: string } | null> {
  const scope = args.scope === "project" ? "project" : "global";
  const base = scope === "project" ? process.cwd() : resolveHome(args.home);
  const roots = scope === "project" ? await discoverClientRootsAt(base) : await discoverClientRoots(base);
  if (args.client === undefined || args.client === "") {
    const list = roots.length > 0 ? roots.map((r) => r.clientId).join(", ") : "(无)";
    console.error("未指定 --client。可用客户端(" + scope + "侧): " + list);
    console.error("默认行为:未指定 --client 时报错并列出可用客户端,绝不猜默认写入对象。");
    process.exitCode = 2;
    return null;
  }
  const root = roots.find((r) => r.clientId === args.client);
  if (root === undefined) {
    const list = roots.length > 0 ? roots.map((r) => r.clientId).join(", ") : "(无)";
    console.error("未找到客户端 " + args.client + "(" + scope + "侧)。可用: " + list);
    process.exitCode = 2;
    return null;
  }
  return { clientId: root.clientId, skillsDir: root.skillsDir };
}

/** 名称解析:dirName 精确,否则哈希前缀(与 show 同口径)。解析失败抛错。 */
export function resolveNames(needle: string, skills: SkillRecord[]): string[] {
  const exact = skills.find((s) => s.dirName === needle);
  if (exact !== undefined) return [exact.dirName];
  const byHash = skills.filter((s) => s.hash.startsWith(needle.toLowerCase()));
  if (byHash.length === 1) return [byHash[0]!.dirName];
  if (byHash.length > 1) {
    throw new Error("哈希前缀不唯一: " + needle + " 命中 " + byHash.length + " 个,请用完整哈希或目录名。");
  }
  throw new Error("库存中没有 " + needle + "(名字或哈希前缀都不匹配)。先 skills-hub list 看有哪些。");
}

/** 同步 index.json 的 visibleIn(由台账推导:某 dirName 在哪些客户端有链接)。 */
export async function syncVisibleIn(storeRoot: string, ledger: LinkEntry[]): Promise<void> {
  const skills = await readStoreIndex(storeRoot);
  let changed = false;
  for (const s of skills) {
    const visible = [...new Set(ledger.filter((e) => e.entryName === s.dirName).map((e) => e.clientId))].sort();
    const same = visible.length === s.visibleIn.length && visible.every((v, i) => v === s.visibleIn[i]);
    if (!same) {
      s.visibleIn = visible;
      changed = true;
    }
  }
  if (changed) await writeStoreIndex(storeRoot, skills);
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
  const client = await resolveClientSkillsDir(args);
  if (client === null) return;
  const scope = args.scope === "project" ? "project" : "global";

  const skills = await readStoreIndex(storeRoot);
  const dirNames = await resolveLinkTargets(args, skills, storeRoot, "enable");
  if (dirNames === null) return;

  const ledger = await readLinksLedger(storeRoot);
  const existing = ledger.filter((e) => e.targetDir === client.skillsDir);
  const kind = process.platform === "win32" ? "junction" : "symlink";
  const now = new Date().toISOString();
  const planNames = new Set(dirNames);
  const keep = existing.filter((e) => !planNames.has(e.entryName));
  const added = dirNames.map((name) => {
    const record = skills.find((s) => s.dirName === name)!;
    const prev = existing.find((e) => e.entryName === name);
    return {
      id: prev?.id ?? client.clientId + ":" + scope + ":" + name,
      clientId: client.clientId,
      scope,
      targetDir: client.skillsDir,
      entryName: name,
      skillHash: record.hash,
      kind: prev?.kind ?? kind,
      createdAt: prev?.createdAt ?? now,
    } satisfies LinkEntry;
  });
  const desired = [...keep, ...added];

  if (dryRun) {
    const wouldCreate = added.map((e) => e.entryName);
    const wouldRemove = existing.filter((e) => !desired.some((d) => d.id === e.id)).map((e) => e.entryName);
    if (args.json) emitOk("enable", { dryRun: true, clientId: client.clientId, scope, targetDir: client.skillsDir, wouldCreate, wouldRemove });
    else {
      console.log("预演(不写盘):");
      for (const n of wouldCreate) console.log("  将建立链接: " + n + " → " + client.skillsDir);
      for (const n of wouldRemove) console.log("  将摘除链接: " + n);
      if (wouldCreate.length === 0 && wouldRemove.length === 0) console.log("  无变更");
    }
    return;
  }

  const result = await applyLinkSet(storeRoot, { targetDir: client.skillsDir, entries: desired });
  if (!result.ok) {
    const extra =
      result.code === "unregistered-conflict"
        ? "落点被用户自己的目录占据且台账未登记 — 绝不覆盖,请人工处理。"
        : result.code === "not-link-conflict"
          ? "台账条目落点已被用户替换为非链接 — 绝不触碰,请人工处理。"
          : "";
    emitError(args.json === true, "enable", "link-failed", "enable 失败: " + result.message + (extra !== "" ? " " + extra : ""));
    return;
  }
  await syncVisibleIn(storeRoot, result.ledger);
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
  const client = await resolveClientSkillsDir(args);
  if (client === null) return;
  const scope = args.scope === "project" ? "project" : "global";

  const skills = await readStoreIndex(storeRoot);
  const dirNames = await resolveLinkTargets(args, skills, storeRoot, "disable");
  if (dirNames === null) return;

  const ledger = await readLinksLedger(storeRoot);
  const existing = ledger.filter((e) => e.targetDir === client.skillsDir);
  const drop = new Set(dirNames);
  const desired = existing.filter((e) => !drop.has(e.entryName));
  const toRemove = existing.filter((e) => drop.has(e.entryName));

  if (dryRun) {
    if (args.json) emitOk("disable", { dryRun: true, clientId: client.clientId, scope, targetDir: client.skillsDir, wouldRemove: toRemove.map((e) => e.entryName) });
    else {
      console.log("预演(不写盘):");
      for (const e of toRemove) console.log("  将摘除链接: " + e.entryName + "(原件保留在库存)");
      if (toRemove.length === 0) console.log("  无变更(这些 skill 未在此客户端启用)");
    }
    return;
  }

  if (toRemove.length === 0) {
    if (args.json) emitOk("disable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: [], removed: [], unchanged: dirNames });
    else console.log("未变更:这些 skill 未在 " + client.clientId + " 启用(原件保留在库存)。");
    return;
  }

  const result = await applyLinkSet(storeRoot, { targetDir: client.skillsDir, entries: desired });
  if (!result.ok) {
    const extra = result.code === "not-link-conflict" ? "台账条目落点已被用户替换为非链接 — 绝不触碰,请人工处理。" : "";
    emitError(args.json === true, "disable", "link-failed", "disable 失败: " + result.message + (extra !== "" ? " " + extra : ""));
    return;
  }
  await syncVisibleIn(storeRoot, result.ledger);
  if (args.json) {
    emitOk("disable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: result.created, removed: result.removed });
    return;
  }
  for (const p of result.removed) console.log("✓ 已禁用(摘除链接): " + path.basename(p));
  console.log("disable 完成,摘除 " + result.removed.length + " 个链接。库存原件一个字节未动。" + (result.created.length > 0 ? "(顺带建立 " + result.created.length + " 个新链接)" : ""));
}

// ============ archive(#23):软删除与归档 ============

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

  // 无参数:列出归档区(可被列出与定位)
  if (names.length === 0) {
    const archived = await listArchivedSkills(storeRoot);
    if (args.json) {
      emitOk("archive", { verb: "list", archiveDir: path.join(storeRoot, STORE_ARCHIVE_DIR), archived });
      return;
    }
    if (archived.length === 0) {
      console.log("归档区为空: " + path.join(storeRoot, STORE_ARCHIVE_DIR));
      return;
    }
    console.log("归档区(" + archived.length + "): " + path.join(storeRoot, STORE_ARCHIVE_DIR));
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
      console.log("✓ 已归档: " + dirName + " → " + res.archiveFile + " (" + res.removedLinks + " 个链接已摘)");
    } else {
      failed++;
      results.push({ dirName, ok: false, code: res.code, message: res.message });
      console.error("✗ 归档失败: " + dirName + " — " + res.message);
    }
  }
  if (args.json) {
    emitOk("archive", { archiveDir: path.join(storeRoot, STORE_ARCHIVE_DIR), results, failed });
  } else {
    console.log("归档完成:" + (dirNames.length - failed) + " 成功 / " + failed + " 失败。");
    console.log("本工具没有真删除。如需彻底删除,请自行处理归档区文件:" + path.join(storeRoot, STORE_ARCHIVE_DIR));
  }
  if (failed > 0) process.exitCode = 2;
}


