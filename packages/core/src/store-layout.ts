import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomicSafe } from "./fs-atomic.js";
import { normalizeHubPaths, type HubPaths } from "./store-location.js";

/**
 * 库存目录布局初始化(spec §2)。
 * 幂等铁律:manifest.json 已存在(且合法)则原样返回,不覆盖、不删除任何已有内容。
 */

export const STORE_LAYOUT_VERSION = 1;

export { STORE_SKILLS_DIR } from "./store-location.js";
/** 软删除归档目录(<name>-<ISO时间戳>.zip) */
export const STORE_ARCHIVE_DIR = "archive";
/** 原子操作暂存目录(操作结束即清空) */
export const STORE_TMP_DIR = "tmp";

/**
 * §2 布局中的四个数据文件。内容契约由各自 issue 定义
 * (links.json → #20、groups.json → #25、stats.json → #27、index.json → #28),
 * init 只落空对象占位,不臆造契约。
 */
export const STORE_DATA_FILES = ["index.json", "links.json", "groups.json", "stats.json"] as const;

export interface StoreManifest {
  version: number;
  createdAt: string;
  trustedRepo?: string;
}

export interface InitLayoutResult {
  /** true = 本次新建;false = 已初始化过(幂等跳过) */
  created: boolean;
  storeRoot: string;
  manifest: StoreManifest;
}

/** 建立 §2 目录布局。重复执行不破坏已有内容。 */
export async function initializeStoreLayout(input: string | HubPaths): Promise<InitLayoutResult> {
  const { stateRoot: storeRoot, skillsRoot } = normalizeHubPaths(input);
  const manifestPath = path.join(storeRoot, "manifest.json");
  const existing = await readManifest(manifestPath);
  if (existing !== null) {
    return { created: false, storeRoot, manifest: existing };
  }

  await mkdir(skillsRoot, { recursive: true });
  for (const dir of [STORE_ARCHIVE_DIR, STORE_TMP_DIR]) {
    await mkdir(path.join(storeRoot, dir), { recursive: true });
  }

  const manifest: StoreManifest = {
    version: STORE_LAYOUT_VERSION,
    createdAt: new Date().toISOString(),
  };
  for (const file of STORE_DATA_FILES) {
    await writeFile(path.join(storeRoot, file), "{}\n", { flag: "wx" }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
  }
  await writeFileAtomicSafe(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { created: true, storeRoot, manifest };
}

/** 读 manifest;文件不存在返回 null,存在但格式非法抛错(绝不静默覆盖用户内容)。 */
async function readManifest(manifestPath: string): Promise<StoreManifest | null> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`manifest.json 已存在但无法解析: ${manifestPath}`);
  }
  const v = data as { version?: unknown; createdAt?: unknown; trustedRepo?: unknown };
  if (typeof v.version !== "number" || typeof v.createdAt !== "string") {
    throw new Error(`manifest.json 已存在但缺少 version/createdAt 字段: ${manifestPath}`);
  }
  const manifest: StoreManifest = { version: v.version, createdAt: v.createdAt };
  if (typeof v.trustedRepo === "string") manifest.trustedRepo = v.trustedRepo;
  return manifest;
}
