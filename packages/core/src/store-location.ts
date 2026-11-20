import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { writeFileAtomicSafe } from "./fs-atomic.js";

/**
 * 库存位置解析(spec §1):显式参数 → 环境变量 → 指针文件 → 报错提示先初始化。
 * core 不触碰 os.homedir():指针文件路径由调用方(cli)计算后注入,
 * 满足 spec §5「home 必须是显式传入的参数」的沙箱铁律。
 */

export interface StoreRootOptions {
  /** 命令行参数 --home <path>(优先级最高) */
  cliHome?: string;
  /** 环境变量 SKILLS_HUB_HOME */
  envHome?: string;
  /** 指针文件绝对路径,如 <home>/.skills-hub/config.json(优先级最低) */
  pointerFilePath?: string;
}

export type StoreRootSource = "cli" | "env" | "pointer";

export const STORE_SKILLS_DIR = "skills";

export interface HubPaths {
  stateRoot: string;
  skillsRoot: string;
  layoutMode: "legacy" | "split";
}

interface HubPreferences {
  git?: { enabled: boolean; remoteUrl?: string; branch?: string };
  autoLaunch?: boolean;
  silentTray?: boolean;
}

export interface HubConfigV2 extends HubPreferences {
  version: 2;
  stateRoot: string;
  skillsRoot: string;
  storeRoot: string;
}

export type HubConfig = ({ version?: 1; storeRoot: string } & HubPreferences) | HubConfigV2;

export function normalizeHubPaths(input: string | HubPaths): HubPaths {
  return typeof input === "string"
    ? { stateRoot: input, skillsRoot: path.join(input, STORE_SKILLS_DIR), layoutMode: "legacy" }
    : input;
}

export type StoreRootResolution =
  | { ok: true; source: StoreRootSource; storeRoot: string }
  | {
      ok: false;
      reason: "not-configured" | "invalid-path" | "invalid-pointer";
      /** 面向用户的可操作错误信息 */
      message: string;
    };

const INIT_HINT = "请先运行 `skills-hub init` 设置库存位置";

export type HubPathsResolution =
  | { ok: true; source: StoreRootSource; paths: HubPaths }
  | Extract<StoreRootResolution, { ok: false }>;

/**
 * 解析库存根目录。返回 ok:false 时绝不静默回退到用户目录,
 * message 指向下一步操作(spec §1 第 4 条)。
 */
export async function resolveStoreRoot(opts: StoreRootOptions): Promise<StoreRootResolution> {
  const resolved = await resolveHubPaths(opts);
  return resolved.ok
    ? { ok: true, source: resolved.source, storeRoot: resolved.paths.stateRoot }
    : resolved;
}

export async function resolveHubPaths(opts: StoreRootOptions): Promise<HubPathsResolution> {
  const explicit: Array<{ source: StoreRootSource; value: string | undefined }> = [
    { source: "cli", value: opts.cliHome },
    { source: "env", value: opts.envHome },
  ];
  for (const c of explicit) {
    const v = c.value?.trim();
    if (v === undefined || v === "") continue;
    if (!path.isAbsolute(v)) {
      return { ok: false, reason: "invalid-path", message: `库存根目录必须是绝对路径,收到: "${v}"。` };
    }
    if (c.source === "cli") {
      const nested = path.join(v, ".skills-hub", "config.json");
      const entry = await lstat(nested).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (entry !== null) return resolveConfig(nested, c.source, true);
    }
    return { ok: true, source: c.source, paths: normalizeHubPaths(v) };
  }

  if (opts.pointerFilePath !== undefined) {
    return resolveConfig(opts.pointerFilePath, "pointer", false);
  }

  return { ok: false, reason: "not-configured", message: `未配置库存位置。${INIT_HINT}。` };
}

async function resolveConfig(file: string, source: StoreRootSource, required: boolean): Promise<HubPathsResolution> {
  const config = await readHubConfig(file);
  if (config === null) {
    return {
      ok: false,
      reason: required ? "invalid-pointer" : "not-configured",
      message: `指针文件不存在、格式无效或缺少库存位置。${INIT_HINT}。`,
    };
  }
  const paths: HubPaths = config.version === 2
    ? { stateRoot: config.stateRoot, skillsRoot: config.skillsRoot, layoutMode: "split" }
    : normalizeHubPaths(config.storeRoot);
  if (!path.isAbsolute(paths.stateRoot) || !path.isAbsolute(paths.skillsRoot)) {
    return { ok: false, reason: "invalid-pointer", message: "指针文件中的库存路径必须是绝对路径。" };
  }
  return { ok: true, source, paths };
}

/**
 * 读取指针文件中的 storeRoot。文件缺失、JSON 无效或缺少非空 storeRoot 字段一律返回 null
 * (解析层不区分,由 resolveStoreRoot 统一给出可操作错误)。
 */
export async function readPointerStoreRoot(pointerFilePath: string): Promise<string | null> {
  return (await readHubConfig(pointerFilePath))?.storeRoot ?? null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonempty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function readHubConfig(configPath: string): Promise<HubConfig | null> {
  let data: Record<string, unknown> | null;
  try {
    data = objectRecord(JSON.parse(await readFile(configPath, "utf8")));
  } catch {
    return null;
  }
  if (data === null) return null;
  const preferences: HubPreferences = {};
  const git = objectRecord(data.git);
  if (typeof git?.enabled === "boolean") {
    preferences.git = { enabled: git.enabled };
    if (typeof git.remoteUrl === "string") preferences.git.remoteUrl = git.remoteUrl;
    if (typeof git.branch === "string") preferences.git.branch = git.branch;
  }
  if (typeof data.autoLaunch === "boolean") preferences.autoLaunch = data.autoLaunch;
  if (typeof data.silentTray === "boolean") preferences.silentTray = data.silentTray;
  if (data.version !== 2) {
    const storeRoot = nonempty(data.storeRoot);
    return storeRoot === null || (data.version !== undefined && data.version !== 1)
      ? null
      : { storeRoot, ...preferences };
  }
  const stateRoot = nonempty(data.stateRoot);
  const skillsRoot = nonempty(data.skillsRoot);
  if (stateRoot === null || skillsRoot === null) return null;
  return { version: 2, stateRoot, skillsRoot, storeRoot: stateRoot, ...preferences };
}

export async function writeHubConfig(configPath: string, config: HubConfigV2): Promise<void> {
  if (!path.isAbsolute(config.stateRoot) || !path.isAbsolute(config.skillsRoot)) {
    throw new Error("库存路径必须是绝对路径。");
  }
  await writeFileAtomicSafe(configPath, JSON.stringify({ ...config, storeRoot: config.stateRoot }, null, 2) + "\n");
}
