import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHubPaths, type HubPaths } from "./store-location.js";
import { STORE_TMP_DIR } from "./store-layout.js";
import { uniqueTmpId } from "./tmp-id.js";

/**
 * 调用计数(#27):CLI 是唯一且准确的计数点(cli-commands-v0.md §4.2)。
 * show 与 enable 各记一次,事件类型可区分。
 * - 并发不丢计数:读-改-写带内容校验重试(CAS),同秒多次调用互不覆盖
 * - 损坏或缺失降级为空统计,绝不让 CLI 崩掉(损坏文件在下次写入时自愈)
 * - 预演模式不计数(由调用方保证,计数只发生在真实操作后)
 */

export const STATS_FILE_VERSION = 1;

export type UsageKind = "show" | "enable";

export interface UsageCounters {
  show: number;
  enable: number;
}

export interface StatsFile {
  version: number;
  /** skill 哈希 → 计数 */
  counters: Record<string, UsageCounters>;
}

export interface UsageRankEntry {
  skillHash: string;
  show: number;
  enable: number;
  total: number;
}

const file = (storeRoot: string | HubPaths): string => path.join(normalizeHubPaths(storeRoot).stateRoot, "stats.json");

function empty(): StatsFile {
  return { version: STATS_FILE_VERSION, counters: {} };
}

/**
 * 解析;缺失/占位 {} → 空;JSON 损坏 → 空(降级,自愈由下一次写入完成)。
 * 低版本走迁移链(保留已有数据),不再静默重置。
 */
function parse(raw: string): StatsFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty();
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return empty();
  const obj = data as { version?: unknown; counters?: unknown };
  if (obj.version === undefined && obj.counters === undefined) return empty();
  if (typeof obj.counters !== "object" || obj.counters === null || Array.isArray(obj.counters)) {
    return empty();
  }
  const version = typeof obj.version === "number" ? obj.version : STATS_FILE_VERSION;
  if (version > STATS_FILE_VERSION) return empty();
  return { version: STATS_FILE_VERSION, counters: obj.counters as Record<string, UsageCounters> };
}

/** 读统计;任何异常(缺失/损坏/占位)都降级为空统计,不抛错。 */
export async function readUsageStats(storeRoot: string | HubPaths): Promise<StatsFile> {
  try {
    return parse(await readFile(file(storeRoot), "utf8"));
  } catch {
    return empty();
  }
}

async function writeStats(storeRoot: string | HubPaths, stats: StatsFile): Promise<void> {
  const target = file(storeRoot);
  const tmpDir = path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_TMP_DIR);
  await mkdir(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, "stats." + uniqueTmpId() + ".tmp");
  await writeFile(tmp, JSON.stringify({ version: STATS_FILE_VERSION, counters: stats.counters }, null, 2) + "\n", "utf8");
  await rename(tmp, target);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 跨进程互斥(mkdir 原子性):tmp 下持锁做读-改-写,杜绝同秒并发互相覆盖。
 * 先确保 tmp 目录存在,避免缺失 tmp/ 时 ENOENT 死循环;
 * 锁僵死(进程崩溃)超过 5s 强制夺锁。
 */
async function withStatsLock<T>(storeRoot: string | HubPaths, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(normalizeHubPaths(storeRoot).stateRoot, STORE_TMP_DIR, "stats.lock");
  await mkdir(path.dirname(lockDir), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      await mkdir(lockDir);
      break;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        await mkdir(path.dirname(lockDir), { recursive: true });
        continue;
      }
      if (Date.now() - started > 5000) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      await sleep(4);
    }
  }
  try {
    return await fn();
  } finally {
    await rmdir(lockDir).catch(() => undefined);
  }
}

/**
 * 记一次使用(锁内读-改-写,并发安全;任何失败静默降级,统计不影响主流程)。
 * 预演模式不计数由调用方保证——只在真实操作后调用。
 */
export async function recordUsage(storeRoot: string | HubPaths, skillHash: string, kind: UsageKind): Promise<void> {
  try {
    await withStatsLock(storeRoot, async () => {
      const stats = await readUsageStats(storeRoot); // 缺失/损坏降级为空
      const c = stats.counters[skillHash] ?? { show: 0, enable: 0 };
      c[kind]++;
      stats.counters[skillHash] = c;
      await writeStats(storeRoot, stats);
    });
  } catch {
    /* 统计只是副产品,失败静默降级 */
  }
}

/**
 * 内容哈希变更时(如保存编辑),在 stats 锁内把 oldHash 的计数合并迁移到 newHash。
 * 若 oldHash 无记录则不写入。
 */
export async function migrateSkillStatsHash(
  storeRoot: string | HubPaths,
  oldHash: string,
  newHash: string,
): Promise<void> {
  if (oldHash === newHash) return;
  await withStatsLock(storeRoot, async () => {
    const stats = await readUsageStats(storeRoot);
    const prev = stats.counters[oldHash];
    if (prev === undefined) return;
    const existing = stats.counters[newHash];
    stats.counters[newHash] = {
      show: (existing?.show ?? 0) + (typeof prev.show === "number" ? prev.show : 0),
      enable: (existing?.enable ?? 0) + (typeof prev.enable === "number" ? prev.enable : 0),
    };
    delete stats.counters[oldHash];
    await writeStats(storeRoot, stats);
  });
}

/** 按总使用次数降序的排名(同分按哈希字典序,确定性)。 */
export function usageRanking(stats: StatsFile): UsageRankEntry[] {
  const entries: UsageRankEntry[] = [];
  for (const [skillHash, c] of Object.entries(stats.counters)) {
    entries.push({ skillHash, show: c.show, enable: c.enable, total: c.show + c.enable });
  }
  entries.sort((a, b) => b.total - a.total || a.skillHash.localeCompare(b.skillHash));
  return entries;
}
