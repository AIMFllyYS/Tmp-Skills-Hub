import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Context, Hono } from "hono";
import { computeDirDiskUsage, readHubConfig, writeHubConfig, writeFileAtomicSafe, type HubConfig } from "@skills-hub/core";
import { performPrune } from "./doctor.js";
import { performMigrate } from "./store-migrate.js";
import { performAcceptDrift } from "./store-query.js";
import { POINTER_REL } from "./store-shared.js";
import { err, setUiPaths, withStore, type DesktopPreferences, type UiRouteContext } from "./ui-http.js";
import { scrub } from "./llm/errors.js";

async function jsonObject(c: Context): Promise<Record<string, unknown> | null> {
  const text = await c.req.text();
  if (text.trim() === "") return {};
  try {
    const raw: unknown = JSON.parse(text);
    return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function preferences(config: HubConfig | null) {
  return {
    git: config?.git ?? { enabled: false },
    autoLaunch: config?.autoLaunch ?? false,
    silentTray: config?.silentTray ?? false,
  };
}

export async function readDesktopPreferences(home: string): Promise<DesktopPreferences> {
  const { autoLaunch, silentTray } = preferences(await readHubConfig(path.join(home, POINTER_REL)));
  return { autoLaunch, silentTray };
}

export function registerSettingsRoutes(app: Hono, ctx: UiRouteContext): void {
  const configFile = path.join(ctx.home, POINTER_REL);
  let preferenceWrites = Promise.resolve();

  function enqueuePreferenceWrite(action: () => Promise<Response>): Promise<Response> {
    const result = preferenceWrites.then(action);
    preferenceWrites = result.then(() => undefined, () => undefined);
    return result;
  }

  app.get("/api/settings", (c) => withStore(ctx, c, "settings", async (paths) => {
    const config = await readHubConfig(configFile);
    const { bytes } = await computeDirDiskUsage(paths.stateRoot);
    return c.json({ ok: true, command: "settings", ...paths, stateDiskBytes: bytes, ...preferences(config), isDesktop: ctx.desktop });
  }));

  app.patch("/api/settings", (c) => enqueuePreferenceWrite(() => withStore(ctx, c, "settings", async (paths) => {
    const fields = ["gitEnabled", "autoLaunch", "silentTray"];
    const body = await jsonObject(c);
    if (body === null || Object.entries(body).some(([key, value]) => !fields.includes(key) || typeof value !== "boolean")) {
      return err(c, "settings", "bad-usage", "只接受布尔值 gitEnabled / autoLaunch / silentTray");
    }
    const config = await readHubConfig(configFile);
    const current = preferences(config);
    const next = {
      git: { ...current.git, enabled: typeof body.gitEnabled === "boolean" ? body.gitEnabled : current.git.enabled },
      autoLaunch: typeof body.autoLaunch === "boolean" ? body.autoLaunch : current.autoLaunch,
      silentTray: typeof body.silentTray === "boolean" ? body.silentTray : current.silentTray,
    };
    const notify = ctx.desktop && (next.autoLaunch !== current.autoLaunch || next.silentTray !== current.silentTray)
      ? ctx.onDesktopPreferences : undefined;
    try {
      notify?.({ autoLaunch: next.autoLaunch, silentTray: next.silentTray });
    } catch (error) {
      return err(c, "settings", "io-error", scrub(error instanceof Error ? error.message : String(error)));
    }
    try {
      if (Object.keys(body).length > 0) {
        if (paths.layoutMode === "split") {
          await writeHubConfig(configFile, { version: 2, stateRoot: paths.stateRoot, skillsRoot: paths.skillsRoot, storeRoot: paths.stateRoot, ...next });
        } else {
          await mkdir(path.dirname(configFile), { recursive: true });
          await writeFileAtomicSafe(configFile, JSON.stringify({ storeRoot: paths.stateRoot, ...next }, null, 2) + "\n");
        }
      }
    } catch (error) {
      notify?.({ autoLaunch: current.autoLaunch, silentTray: current.silentTray });
      throw error;
    }
    const { bytes } = await computeDirDiskUsage(paths.stateRoot);
    return c.json({ ok: true, command: "settings", ...paths, stateDiskBytes: bytes, ...next, isDesktop: ctx.desktop });
  })));

  app.post("/api/doctor/prune", (c) => withStore(ctx, c, "doctor-prune", async (paths) => {
    const body = await jsonObject(c);
    if (body === null || (body.dryRun !== undefined && typeof body.dryRun !== "boolean")) {
      return err(c, "doctor-prune", "bad-usage", "body 需要 { dryRun?: boolean }");
    }
    return c.json({ ok: true, command: "doctor-prune", ...await performPrune(paths, body.dryRun === true) });
  }));

  app.post("/api/verify/accept", (c) => withStore(ctx, c, "verify-accept", async (paths) => {
    const body = await jsonObject(c);
    if (body === null || (body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
      (body.names !== undefined && (!Array.isArray(body.names) || !body.names.every((name: unknown) => typeof name === "string" && name.trim() !== "")))) {
      return err(c, "verify-accept", "bad-usage", "body 需要 { names?: string[], dryRun?: boolean }");
    }
    const result = await performAcceptDrift(paths, Array.isArray(body.names) ? body.names as string[] : [], body.dryRun === true);
    return result.ok ? c.json({ ...result, command: "verify-accept" }) : err(c, "verify-accept", result.code, result.message);
  }));

  app.post("/api/store/migrate", (c) => withStore(ctx, c, "store-migrate", async (paths) => {
    const body = await jsonObject(c);
    if (body === null || typeof body.targetSkillsRoot !== "string" || (body.dryRun !== undefined && typeof body.dryRun !== "boolean")) {
      return err(c, "store-migrate", "bad-usage", "body 需要 { targetSkillsRoot: string, dryRun?: boolean }");
    }
    const result = await performMigrate({ home: ctx.home, paths, targetSkillsRoot: body.targetSkillsRoot, dryRun: body.dryRun === true });
    if (!result.ok) return err(c, "store-migrate", result.code, result.message);
    if (!result.dryRun) setUiPaths(ctx, result.paths);
    return c.json({ ...result, command: "store-migrate" });
  }));
}
