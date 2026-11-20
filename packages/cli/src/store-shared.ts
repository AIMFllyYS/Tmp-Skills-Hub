import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ensureBuiltinGroups,
  initializeStoreLayout,
  resolveStoreRoot,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { emitError } from "./json-out.js";

export const POINTER_REL = path.join(".skills-hub", "config.json");

/** 指针文件:tmp+rename 原子写。init 与 bootstrap 共用。 */
export async function writePointerFile(home: string, storeRoot: string): Promise<string> {
  const pointerFile = path.join(home, POINTER_REL);
  await mkdir(path.dirname(pointerFile), { recursive: true });
  const tmp = pointerFile + ".tmp-" + process.pid + "-" + Date.now();
  await writeFile(tmp, JSON.stringify({ storeRoot }, null, 2) + "\n", "utf8");
  await rename(tmp, pointerFile);
  return pointerFile;
}

/** 解析库存位置;未配置时输出契约失败信封并返回 null(退出码 2 由 helper 设置)。 */
export async function resolveStoreRootOrFail(
  args: { home: string | undefined; json: boolean | undefined },
  command: string,
): Promise<string | null> {
  const home = resolveHome(args.home);
  const opts: StoreRootOptions = { pointerFilePath: path.join(home, POINTER_REL) };
  if (args.home !== undefined && args.home !== "") opts.cliHome = args.home;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") opts.envHome = envHome;
  const store = await resolveStoreRoot(opts);
  if (!store.ok) {
    emitError(
      args.json === true,
      command,
      "store-not-configured",
      "库存未配置:" + store.message + " — 请先运行 skills-hub init --home <path> --yes",
    );
    return null;
  }
  return store.storeRoot;
}

/** 写操作授权铁律(cli-commands-v0.md §2):非交互环境必须显式 --yes。 */
export function requireWriteAuth(
  args: { yes: boolean | undefined; json: boolean | undefined },
  command: string,
): boolean {
  if (process.stdin.isTTY || args.yes === true) return true;
  emitError(args.json === true, command, "auth-required", "写操作需要显式授权:非交互环境请加 --yes。");
  return false;
}

export interface PerformInitResult {
  ok: true;
  storeRoot: string;
  pointerFile: string;
  layoutCreated: boolean;
  builtinGroupsWrote: boolean;
}

export interface PerformInitFailure {
  ok: false;
  code: "bad-usage" | "io-error";
  message: string;
}

/** CLI init 与 HTTP POST /api/store/init 共用的库存初始化内核。 */
export async function performInit(
  home: string,
  storeRootInput?: string,
): Promise<PerformInitResult | PerformInitFailure> {
  const resolvedHome = resolveHome(home);
  const raw = storeRootInput?.trim();
  const targetRoot =
    raw !== undefined && raw !== ""
      ? raw
      : path.join(resolvedHome, ".skills-hub", "store");
  if (!path.isAbsolute(targetRoot)) {
    return { ok: false, code: "bad-usage", message: "库存根目录必须是绝对路径,收到: " + targetRoot };
  }
  const storeRoot = path.resolve(targetRoot);
  try {
    const layout = await initializeStoreLayout(storeRoot);
    const groups = await ensureBuiltinGroups(storeRoot); // #25:内置分组,仅占位/缺失时写入
    const pointerFile = await writePointerFile(resolvedHome, storeRoot);
    return {
      ok: true,
      storeRoot,
      pointerFile,
      layoutCreated: layout.created,
      builtinGroupsWrote: groups.wrote,
    };
  } catch (e) {
    return { ok: false, code: "io-error", message: e instanceof Error ? e.message : String(e) };
  }
}
