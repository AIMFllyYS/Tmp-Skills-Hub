import { z } from "zod";
import type { Context, Hono } from "hono";
import { createGhDeviceLogin } from "./git/index.js";
import { gitFailure } from "./git-cmds.js";
import {
  performCloudPush, performCloudSetup, performGitDiff, performGitLog, performGitStatus, performGitToggle, type GitRuntime,
} from "./git-ops.js";
import { err, withStore, type UiRouteContext } from "./ui-http.js";

const cloudInput = z.strictObject({
  repoName: z.string(),
  visibility: z.enum(["private", "public"]),
  confirmPublicSecrets: z.boolean().optional(),
});

export function registerGitRoutes(app: Hono, ctx: UiRouteContext, runtime: GitRuntime = {}): void {
  const login = runtime.deviceLogin ?? createGhDeviceLogin(runtime.gh === undefined ? {} : { runner: runtime.gh });

  async function execute(c: Context, command: string, action: () => Promise<Response>) {
    try {
      return await action();
    } catch (error) {
      const result = gitFailure(error);
      return err(c, command, result.code, result.message, command === "gh-login-start" && result.code === "git-unavailable" ? 503 : undefined);
    }
  }

  app.get("/api/git/status", (c) => execute(c, "git-status", async () =>
    c.json({ ok: true, command: "git-status", ...await performGitStatus(ctx.home, ctx.paths, runtime) })));

  app.post("/api/git/toggle", (c) => withStore(ctx, c, "git-toggle", async (paths) => execute(c, "git-toggle", async () => {
    const body = z.strictObject({ enabled: z.boolean() }).safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return err(c, "git-toggle", "bad-usage", "body 需要 { enabled: boolean }。");
    return c.json({ ok: true, command: "git-toggle", ...await performGitToggle(ctx.home, paths, body.data.enabled, runtime) });
  })));

  app.get("/api/git/log", (c) => withStore(ctx, c, "git-log", async (paths) => execute(c, "git-log", async () => {
    const limit = Number(c.req.query("limit") ?? "30");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return err(c, "git-log", "bad-usage", "limit 需要 1 到 100。");
    const commits = await performGitLog(ctx.home, paths, c.req.query("skill"), limit, runtime);
    return c.json({ ok: true, command: "git-log", commits });
  })));

  app.get("/api/git/diff", (c) => withStore(ctx, c, "git-diff", async (paths) => execute(c, "git-diff", async () => {
    const commit = c.req.query("commit");
    if (commit === undefined || !/^[a-f0-9]{7,64}$/i.test(commit)) {
      return err(c, "git-diff", "bad-usage", "必须指定 7 到 64 位提交哈希。");
    }
    const patch = await performGitDiff(ctx.home, paths, { commit, skill: c.req.query("skill") }, runtime);
    return c.json({ ok: true, command: "git-diff", commit, patch });
  })));

  app.post("/api/git/gh/login/start", (c) => withStore(ctx, c, "gh-login-start", async (paths) => execute(c, "gh-login-start", async () =>
    c.json({ ok: true, command: "gh-login-start", ...await login.start(paths.skillsRoot) }))));

  app.get("/api/git/gh/login/status", (c) => execute(c, "gh-login-status", async () =>
    c.json({ ok: true, command: "gh-login-status", ...login.poll(c.req.query("sessionId") ?? "") })));

  app.post("/api/git/cloud/setup", (c) => withStore(ctx, c, "git-cloud-init", async (paths) => execute(c, "git-cloud-init", async () => {
    const body = cloudInput.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return err(c, "git-cloud-init", "bad-usage", "需要仓库名称与 private/public 可见性。");
    const result = await performCloudSetup(ctx.home, paths, {
      repoName: body.data.repoName, visibility: body.data.visibility, confirmPublicSecrets: body.data.confirmPublicSecrets === true,
    }, runtime);
    if (result.ok) return c.json({ ...result, command: "git-cloud-init" });
    if (result.code === "secret-detected") return c.json({ ...result, command: "git-cloud-init" }, 409);
    return err(c, "git-cloud-init", result.code, result.message);
  })));

  app.post("/api/git/cloud/push", (c) => withStore(ctx, c, "git-cloud-push", async (paths) => execute(c, "git-cloud-push", async () => {
    const result = await performCloudPush(ctx.home, paths, runtime);
    return result.ok ? c.json({ ...result, command: "git-cloud-push" }) : err(c, "git-cloud-push", result.code, result.message);
  })));
}
