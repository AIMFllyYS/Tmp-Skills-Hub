import { planReconcile } from "@skills-hub/core";
import type { Context, Hono } from "hono";
import { performReconcile, reconcilePreview, reconcileSummary } from "./reconcile-cmds.js";
import { err, withStore, type UiRouteContext } from "./ui-http.js";

async function includesExternalLinks(c: Context, optional = false): Promise<boolean | null> {
  const text = await c.req.text();
  if (text.trim() === "") return optional ? false : null;
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    if (!("includeExternalLinks" in value)) return false;
    return typeof value.includeExternalLinks === "boolean" ? value.includeExternalLinks : null;
  } catch {
    return null;
  }
}

export function registerReconcileRoutes(app: Hono, ctx: UiRouteContext): void {
  app.get("/api/reconcile/scan", (c) => withStore(ctx, c, "reconcile-scan", async (paths) => {
    const plan = await planReconcile(ctx.home, paths);
    return c.json({ ok: true, command: "reconcile-scan", ...reconcileSummary(plan.scan, plan.conflicts.length) });
  }));
  app.post("/api/reconcile/preview", (c) => withStore(ctx, c, "reconcile-preview", async (paths) => {
    const includeExternalLinks = await includesExternalLinks(c, true);
    if (includeExternalLinks === null) return err(c, "reconcile-preview", "bad-usage", "body 需要 { includeExternalLinks?: boolean }");
    const plan = await planReconcile(ctx.home, paths, { includeExternalLinks });
    return c.json({ ok: true, command: "reconcile-preview", ...reconcilePreview(plan) });
  }));
  app.post("/api/reconcile/apply", (c) => withStore(ctx, c, "reconcile-apply", async (paths) => {
    const includeExternalLinks = await includesExternalLinks(c);
    if (includeExternalLinks === null) return err(c, "reconcile-apply", "bad-usage", "body 需要 { includeExternalLinks?: boolean }");
    const result = await performReconcile(ctx.home, paths, includeExternalLinks);
    return result.ok
      ? c.json({ ...result, command: "reconcile-apply" })
      : err(c, "reconcile-apply", result.code, result.message);
  }));
}
