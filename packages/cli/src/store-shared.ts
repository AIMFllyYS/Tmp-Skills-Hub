import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  ensureBuiltinGroups,
  initializeStoreLayout,
  normalizeHubPaths,
  resolveHubPaths,
  writeFileAtomicSafe,
  writeHubConfig,
  type HubPaths,
  type HubPathsResolution,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { emitError } from "./json-out.js";

export const POINTER_REL = path.join(".skills-hub", "config.json");

/** 指针文件:tmp+rename 原子写。init 与 bootstrap 共用。 */
export async function writePointerFile(home: string, storeRoot: string | HubPaths): Promise<string> {
  const pointerFile = path.join(home, POINTER_REL);
  await mkdir(path.dirname(pointerFile), { recursive: true });
  const paths = normalizeHubPaths(storeRoot);
  if (paths.layoutMode === "split") {
    const { stateRoot, skillsRoot } = paths;
    await writeHubConfig(pointerFile, { version: 2, stateRoot, skillsRoot, storeRoot: stateRoot });
  } else {
    await writeFileAtomicSafe(pointerFile, JSON.stringify({ storeRoot: paths.stateRoot }, null, 2) + "\n");
  }
  return pointerFile;
}

export async function resolveConfiguredHubPaths(home: string): Promise<HubPathsResolution> {
  const pointerFilePath = path.join(home, POINTER_REL);
  if (await lstat(pointerFilePath).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) {
    return resolveHubPaths({ cliHome: home });
  }
  if (await lstat(path.join(home, "manifest.json")).then((entry) => entry.isFile(), () => false)) {
    return resolveHubPaths({ cliHome: home });
  }
  return resolveHubPaths({ pointerFilePath });
}

/** 解析库存位置;未配置时输出契约失败信封并返回 null(退出码 2 由 helper 设置)。 */
export async function resolveStoreRootOrFail(
  args: { home: string | undefined; json: boolean | undefined },
  command: string,
): Promise<HubPaths | null> {
  const home = resolveHome(args.home);
  const store = await resolveConfiguredHubPaths(home);
  if (!store.ok) {
    emitError(
      args.json === true,
      command,
      "store-not-configured",
      "库存未配置:" + store.message + " — 请先运行 skills-hub init --home <path> --yes",
    );
    return null;
  }
  return store.paths;
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
  paths: HubPaths;
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
export function planInitialPaths(home: string, input?: string | { skillsRoot?: string }): HubPaths {
  if (!path.isAbsolute(home)) throw new Error("home 必须是绝对路径: " + home);
  const requested = (typeof input === "string" ? input : input?.skillsRoot)?.trim();
  if (requested && !path.isAbsolute(requested)) throw new Error("库存路径必须是绝对路径: " + requested);
  if (typeof input === "string" && requested) return normalizeHubPaths(path.resolve(requested));
  const stateRoot = path.resolve(home, ".skills-hub");
  return {
    stateRoot,
    skillsRoot: requested ? path.resolve(requested) : path.join(stateRoot, "skills"),
    layoutMode: "split",
  };
}

export async function performInit(
  home: string,
  input?: string | { skillsRoot?: string },
): Promise<PerformInitResult | PerformInitFailure> {
  const resolvedHome = resolveHome(home);
  let paths: HubPaths;
  try {
    paths = planInitialPaths(resolvedHome, input);
  } catch (error) {
    return { ok: false, code: "bad-usage", message: String(error) };
  }
  try {
    const configured = await resolveConfiguredHubPaths(resolvedHome);
    if (!configured.ok && configured.reason === "invalid-pointer") {
      return { ok: false, code: "bad-usage", message: configured.message };
    }
    const hasRequest = typeof input === "string" ? Boolean(input.trim()) : Boolean(input?.skillsRoot?.trim());
    if (configured.ok && hasRequest && path.relative(configured.paths.skillsRoot, paths.skillsRoot) !== "") {
      return { ok: false, code: "bad-usage", message: "库存已初始化。请用 migrate 更换真源路径。" };
    }
    if (configured.ok) paths = configured.paths;
    else if (paths.layoutMode === "split") {
      const { validateSkillsRoot } = await import("./store-migrate.js");
      const validation = await validateSkillsRoot(resolvedHome, paths.stateRoot, paths.skillsRoot);
      if (!validation.ok) return { ok: false, code: "bad-usage", message: validation.message };
      paths = { ...paths, skillsRoot: validation.target };
    }
    const layout = await initializeStoreLayout(paths);
    const groups = await ensureBuiltinGroups(paths);
    const pointerFile = configured.ok && await lstat(path.join(resolvedHome, POINTER_REL)).catch(() => null)
      ? path.join(resolvedHome, POINTER_REL)
      : await writePointerFile(resolvedHome, paths);
    return {
      ok: true,
      storeRoot: paths.stateRoot,
      paths,
      pointerFile,
      layoutCreated: layout.created,
      builtinGroupsWrote: groups.wrote,
    };
  } catch (e) {
    return { ok: false, code: "io-error", message: e instanceof Error ? e.message : String(e) };
  }
}
