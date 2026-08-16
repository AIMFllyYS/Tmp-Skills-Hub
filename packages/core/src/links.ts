import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { readLinkTarget } from "./link-probe.js";
import { STORE_SKILLS_DIR } from "./store-layout.js";

/**
 * 受管链接台账(#20):区分「我们建的」与「用户自己的」。
 *
 * 客户端 skills 目录里同时存在用户真实 skill 文件夹和本工具建的链接,
 * 没有台账就只能靠猜,猜错会删掉用户的东西(产品红线)。
 * 任何链接变更都先查台账;台账记录在库存根目录 links.json(spec §2)。
 */

export const LINKS_LEDGER_VERSION = 1;

/** 落盘形态:junction/symlink 是链接,#22 的降级路径允许 copy。 */
export type LinkEntryKind = "junction" | "symlink" | "copy";

export interface LinkEntry {
  /** 稳定唯一 id(回滚/删除定位用,不随落点变化) */
  id: string;
  /** 客户端 id(如 claude/cursor),与 discoverClientRoots 口径一致 */
  clientId: string;
  /** 客户端内的范围(默认 "skills";未来子目录范围在此表达) */
  scope: string;
  /** 落点目录绝对路径(客户端 skills 根或其下子目录) */
  targetDir: string;
  /** 条目名(= 链接名,通常等于 skill 的 dirName) */
  entryName: string;
  /** 指向库存里的哪个 skill(内容哈希,与 index.json 记录一致) */
  skillHash: string;
  /** 落盘形态 */
  kind: LinkEntryKind;
  createdAt: string;
}

export interface LinksLedgerFile {
  version: number;
  entries: LinkEntry[];
}

/** 读台账:文件缺失或 init 占位 {} → 空台账;损坏/版本不符 → 抛错不重置。 */
export async function readLinksLedger(storeRoot: string): Promise<LinkEntry[]> {
  const file = path.join(storeRoot, "links.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("links.json 损坏(无法解析): " + file, { cause: e });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("links.json 损坏(结构不是对象): " + file);
  }
  const obj = parsed as { version?: unknown; entries?: unknown };
  if (obj.entries === undefined) {
    // init 占位 {} → 空台账
    if (obj.version === undefined) return [];
    throw new Error("links.json 损坏(缺 entries 字段): " + file);
  }
  if (obj.version !== LINKS_LEDGER_VERSION) {
    throw new Error("links.json 版本不支持: " + String(obj.version) + " (期望 " + LINKS_LEDGER_VERSION + ")");
  }
  if (!Array.isArray(obj.entries)) {
    throw new Error("links.json 损坏(entries 不是数组): " + file);
  }
  return obj.entries as LinkEntry[];
}

/** 原子写台账:先写 tmp 再 rename,中断不产生半个文件。 */
export async function writeLinksLedger(storeRoot: string, entries: LinkEntry[]): Promise<void> {
  const file = path.join(storeRoot, "links.json");
  const tmp = path.join(storeRoot, "links." + process.pid + "-" + Date.now() + ".tmp");
  await writeFile(tmp, JSON.stringify({ version: LINKS_LEDGER_VERSION, entries }, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

/** 追加/更新条目(按 id 去重),整份重写,原子。返回新清单。 */
export async function upsertLinkEntries(storeRoot: string, entries: LinkEntry[]): Promise<LinkEntry[]> {
  const current = await readLinksLedger(storeRoot);
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const entry of entries) byId.set(entry.id, entry);
  const next = [...byId.values()];
  await writeLinksLedger(storeRoot, next);
  return next;
}

/** 按 id 移除条目,整份重写,原子。返回剩余清单。 */
export async function removeLinkEntries(storeRoot: string, ids: string[]): Promise<LinkEntry[]> {
  const current = await readLinksLedger(storeRoot);
  const drop = new Set(ids);
  const next = current.filter((e) => !drop.has(e.id));
  await writeLinksLedger(storeRoot, next);
  return next;
}

/** 查询某客户端(可再按范围过滤)建过哪些条目。纯函数,不读盘。 */
export function queryLinksByClient(entries: LinkEntry[], clientId: string, scope?: string): LinkEntry[] {
  return entries.filter((e) => {
    if (e.clientId !== clientId) return false;
    if (scope !== undefined && e.scope !== scope) return false;
    return true;
  });
}

export type LinkEntryState = "ok" | "missing" | "not-link" | "target-invalid";

export interface LinkEntryCheck {
  entry: LinkEntry;
  state: LinkEntryState;
  /** 链接当前指向(ok 时给出);非链接/缺失时为 null */
  target: string | null;
  /** 期望目标(store skills/<entryName> 的 realpath),用于不一致排查 */
  expectedTarget: string | null;
}

/**
 * 台账与磁盘对账:逐条检查落点条目。
 * - missing:条目已被外部删除(或从未生效)→ 台账脏,可安全重建
 * - not-link:落点存在但不是链接(用户用自己的文件夹占了名字)→ 绝不触碰,报警
 * - target-invalid:链接还在但指向的 store 目录缺失/哈希不符 → 链接失效,需重建
 * 只读,不修改任何东西。
 */
export async function checkLinksLedger(storeRoot: string, entries: LinkEntry[]): Promise<LinkEntryCheck[]> {
  const checks: LinkEntryCheck[] = [];
  for (const entry of entries) {
    const linkPath = path.join(entry.targetDir, entry.entryName);
    const expectedDir = path.join(storeRoot, STORE_SKILLS_DIR, entry.entryName);
    const target = await readLinkTarget(linkPath);
    const expectedTarget = await realpathIfExists(expectedDir);
    if (target === null) {
      const exists = await pathExists(linkPath);
      checks.push({
        entry,
        state: exists ? "not-link" : "missing",
        target: null,
        expectedTarget,
      });
      continue;
    }
    if (expectedTarget === null) {
      checks.push({ entry, state: "target-invalid", target, expectedTarget });
      continue;
    }
    checks.push({ entry, state: "ok", target, expectedTarget });
  }
  return checks;
}

async function realpathIfExists(p: string): Promise<string | null> {
  try {
    return await realpath(p);
  } catch {
    return null;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}


