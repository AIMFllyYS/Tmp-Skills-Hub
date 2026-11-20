import type { Hono } from "hono";
import { readConflicts } from "@skills-hub/core";
import { conflictError, getSharedConflictDiff, performConflictResolution, readConflictText } from "./conflict-cmds.js";
import { err, withStore, type UiRouteContext } from "./ui-http.js";

export function registerConflictRoutes(app: Hono, ctx: UiRouteContext): void {
  app.get("/api/conflicts", (c) => withStore(ctx, c, "conflicts-list", async (paths) => {
    return c.json({ ok: true, command: "conflicts-list", conflicts: await readConflicts(paths) });
  }));
  app.get("/api/conflicts/:name/diff", (c) => withStore(ctx, c, "conflicts-diff", async (paths) => {
    const command = "conflicts-diff";
    try {
      const diff = await getSharedConflictDiff(paths, c.req.param("name"), c.req.query("a"), c.req.query("b"));
      return c.json({ ok: true, command, ...diff });
    } catch (error) {
      const failure = conflictError(error);
      return err(c, command, failure.code, failure.message);
    }
  }));
  app.get("/api/conflicts/:name/file", (c) => withStore(ctx, c, "conflicts-file", async (paths) => {
    const command = "conflicts-file";
    const variant = c.req.query("variant");
    const path = c.req.query("path");
    if (!variant || !path) return err(c, command, "bad-usage", "必须指定 variant 和 path");
    const result = await readConflictText(paths, c.req.param("name"), variant, path);
    return result.ok ? c.json({ ...result, command, variant, path }) : err(c, command, result.code, result.message);
  }));
  app.post("/api/conflicts/:name/resolve", (c) => withStore(ctx, c, "conflicts-resolve", async (paths) => {
    const command = "conflicts-resolve";
    const body = await c.req.json<unknown>().catch(() => null);
    const result = await performConflictResolution(paths, c.req.param("name"), body);
    return result.ok ? c.json({ ...result, command }) : err(c, command, result.code, result.message);
  }));
}
