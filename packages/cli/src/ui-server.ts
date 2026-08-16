import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import {
  archiveSkill,
  discoverClientRoots,
  discoverClientRootsAt,
  listArchivedSkills,
  readGroups,
  readLinksLedger,
  readStoreIndex,
  readUsageStats,
  resolveStoreRoot,
  usageRanking,
  type LinkEntry,
  type SkillRecord,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { POINTER_REL, resolveNames } from "./store-cmds.js";
import { performLinkChange } from "./link-actions.js";

export const DEFAULT_UI_PORT = 4321;

/**
 * HTTP 契约(v0,见 docs/specs/http-api-v0.md):面板数据源。
 * - 读端点:skills 列表 / 单个详情 / groups / stats / archive
 * - 写端点:enable / disable / archive(面板按钮即用户显式操作,无需 --yes)
 * - 信封与错误 code 复用 json-contract-v0.md,字段定义不重复发明
 * - 服务只绑 127.0.0.1;storeRoot/home 可注入(沙箱测试)
 */

export interface UiAppOptions {
  /** 库存根;null = 未配置(端点返回 store-not-configured) */
  storeRoot?: string | null;
  /** home 解析基座(沙箱测试注入;缺省 resolveHome()) */
  home?: string;
}

/** 按台账重算 visibleIn(与 syncVisibleIn 同口径:某 dirName 在哪些客户端有链接)。 */
async function attachVisibleIn(storeRoot: string, skills: SkillRecord[], ledger: LinkEntry[]): Promise<SkillRecord[]> {
  const byName = new Map<string, string[]>();
  for (const e of ledger) {
    const arr = byName.get(e.entryName) ?? [];
    if (!arr.includes(e.clientId)) arr.push(e.clientId);
    byName.set(e.entryName, arr);
  }
  return skills.map((s) => ({ ...s, visibleIn: [...(byName.get(s.dirName) ?? [])].sort() }));
}

/** 客户端解析:按注入的 home(沙箱)或真实 home。找不到返回 null。 */
async function resolveClientSkillsDirAt(
  home: string,
  clientId: string,
  scope: "global" | "project",
): Promise<{ clientId: string; skillsDir: string } | null> {
  const base = scope === "project" ? process.cwd() : home;
  const roots = scope === "project" ? await discoverClientRootsAt(base) : await discoverClientRoots(base);
  const root = roots.find((r) => r.clientId === clientId);
  return root === undefined ? null : { clientId: root.clientId, skillsDir: root.skillsDir };
}

export function createUiApp(opts: UiAppOptions = {}): Hono {
  const app = new Hono();
  const storeRoot = opts.storeRoot === undefined ? null : opts.storeRoot;
  const home = opts.home ?? resolveHome();

  const err = (c: Context, command: string, code: string, message: string, status: 400 | 404 | 409 | 503) =>
    c.json({ ok: false, command, code, message }, status);

  const withStore = (c: Context, command: string, fn: (root: string) => Promise<Response>): Promise<Response> =>
    storeRoot === null
      ? Promise.resolve(err(c, command, "store-not-configured", "库存未配置。先运行 skills-hub init --home <path> --yes。", 503))
      : fn(storeRoot);

  app.get("/api/health", (c) => c.json({ ok: true }));

  // ---- 读端点 ----

  app.get("/api/skills", (c) =>
    withStore(c, "skills", async (root) => {
      const skills = await attachVisibleIn(root, await readStoreIndex(root), await readLinksLedger(root));
      return c.json({ ok: true, command: "skills", storeRoot: root, total: skills.length, skills });
    }),
  );

  app.get("/api/skills/:hash", (c) =>
    withStore(c, "skill", async (root) => {
      const needle = c.req.param("hash");
      const skills = await attachVisibleIn(root, await readStoreIndex(root), await readLinksLedger(root));
      const hit = skills.find((s) => s.hash.startsWith(needle.toLowerCase())) ?? skills.find((s) => s.dirName === needle);
      if (hit === undefined) return err(c, "skill", "not-found", "未找到: " + needle, 404);
      return c.json({ ok: true, command: "skill", skill: hit });
    }),
  );

  app.get("/api/groups", (c) =>
    withStore(c, "groups", async (root) => {
      const groups = await readGroups(root);
      return c.json({ ok: true, command: "groups", version: groups.version, groups: groups.groups });
    }),
  );

  app.get("/api/stats", (c) =>
    withStore(c, "stats", async (root) => {
      const stats = await readUsageStats(root);
      return c.json({ ok: true, command: "stats", stats, ranking: usageRanking(stats) });
    }),
  );

  app.get("/api/archive", (c) =>
    withStore(c, "archive", async (root) => {
      const archived = await listArchivedSkills(root);
      return c.json({ ok: true, command: "archive", verb: "list", archiveDir: path.join(root, "archive"), archived });
    }),
  );

  app.get("/api/clients", (c) =>
    discoverClientRoots(home).then((roots) =>
      c.json({ ok: true, command: "clients", clients: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })) }),
    ),
  );

  // ---- 写端点 ----

  interface LinkBody { clientId: string; scope: "global" | "project" }

  const parseLinkBody = async (c: Context): Promise<LinkBody | null> => {
    const body = await c.req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" && body.clientId.trim() !== "" ? body.clientId : null;
    if (clientId === null) return null;
    return { clientId, scope: body?.scope === "project" ? "project" : "global" };
  };

  /** 解析 skill 与客户端;任一缺失返回 null(统一 not-found)。 */
  const resolveLinkTarget = async (
    root: string,
    needle: string,
    body: LinkBody,
  ): Promise<{ dirName: string; clientId: string; scope: "global" | "project"; skillsDir: string } | null> => {
    const client = await resolveClientSkillsDirAt(home, body.clientId, body.scope);
    if (client === null) return null;
    const skills = await readStoreIndex(root);
    try {
      const dirName = resolveNames(needle, skills)[0];
      if (dirName === undefined) return null;
      return { dirName, clientId: client.clientId, scope: body.scope, skillsDir: client.skillsDir };
    } catch {
      return null;
    }
  };

  const linkEndpoint = (action: "enable" | "disable") =>
    (c: Context) =>
      withStore(c, action, async (root) => {
        const body = await parseLinkBody(c);
        if (body === null) return err(c, action, "bad-usage", "缺少 clientId(JSON body 需 { clientId: string, scope?: string })。", 400);
        const target = await resolveLinkTarget(root, c.req.param("hash") ?? "", body);
        if (target === null) return err(c, action, "not-found", "未找到客户端或 skill: " + c.req.param("hash"), 404);
        const result = await performLinkChange(
          { storeRoot: root, clientId: target.clientId, scope: target.scope, skillsDir: target.skillsDir, dirNames: [target.dirName] },
          action,
        );
        if (!result.ok) return err(c, action, result.code, result.message, 409);
        return c.json({
          ok: true,
          command: action,
          clientId: target.clientId,
          scope: target.scope,
          targetDir: target.skillsDir,
          created: result.created,
          removed: result.removed,
        });
      });

  app.post("/api/skills/:hash/enable", linkEndpoint("enable"));
  app.post("/api/skills/:hash/disable", linkEndpoint("disable"));

  app.post("/api/skills/:hash/archive", (c) =>
    withStore(c, "archive", async (root) => {
      const needle = c.req.param("hash");
      const skills = await readStoreIndex(root);
      let dirName: string;
      try {
        const hit = resolveNames(needle, skills)[0];
        if (hit === undefined) return err(c, "archive", "not-found", "未找到: " + needle, 404);
        dirName = hit;
      } catch (e) {
        return err(c, "archive", "not-found", e instanceof Error ? e.message : String(e), 404);
      }
      const res = await archiveSkill(root, dirName);
      if (!res.ok) return err(c, "archive", res.code, res.message, 409);
      return c.json({ ok: true, command: "archive", dirName, archiveFile: res.archiveFile, sizeBytes: res.sizeBytes, removedLinks: res.removedLinks });
    }),
  );

  return app;
}

export async function startUiServer(port = DEFAULT_UI_PORT, home?: string): Promise<void> {
  const h = home ?? resolveHome();
  const opts: StoreRootOptions = { pointerFilePath: path.join(h, POINTER_REL) };
  if (home !== undefined && home !== "") opts.cliHome = home;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") opts.envHome = envHome;
  const resolved = await resolveStoreRoot(opts);
  const storeRoot = resolved.ok ? resolved.storeRoot : null;
  serve({ fetch: createUiApp({ storeRoot, home: h }).fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log("skill-hub ui: http://127.0.0.1:" + info.port + "/api/skills" + (storeRoot === null ? " (库存未配置)" : ""));
  });
}
