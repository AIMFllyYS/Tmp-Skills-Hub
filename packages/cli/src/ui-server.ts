import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import {
  addSkillToGroups,
  archiveSkill,
  restoreArchivedSkill,
  classifyClientLink,
  createGroup,
  deleteGroup,
  discoverClientRoots,
  discoverClientRootsAt,
  listArchivedSkills,
  listBackupSnapshots,
  previewRestoreClientSkills,
  readLatestSnapshotId,
  listSkillFiles,
  readGroups,
  readLinksLedger,
  readSkillFile,
  readStoreIndex,
  removeSkillFromGroups,
  saveSkillFile,
  readUsageStats,
  resolveStoreRoot,
  usageRanking,
  writeGroups,
  type ClientLinkState,
  type LinkEntry,
  type SkillRecord,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { performAdopt, performVerify, POINTER_REL, resolveNames } from "./store-cmds.js";
import { collectDoctorReport } from "./doctor.js";
import { performAnalyze } from "./analyze.js";
import { performShare } from "./share.js";
import { applyLinkBatch, performLinkChange, previewLinkChange, type LinkChangeRequest, type LinkConflictItem, type LinkDiffItem } from "./link-actions.js";
import { chatCompletion } from "./deepseek.js";

export const DEFAULT_UI_PORT = 4321;

/** 翻译代理(#38)常量:超时 60s(长文本),单次截断上限防滥用。 */
export const MAX_TRANSLATE_CHARS = 200_000;

/** 翻译系统提示:保留代码块与 frontmatter 原文,只译说明性文字。 */
export const TRANSLATE_SYSTEM_PROMPT =
  "你是 skill 文档翻译器。把用户给的 Markdown 翻译成简体中文,规则:\n" +
  "- 代码块与行内代码、frontmatter(--- 之间的 YAML)、URL 一律保留原文,绝不翻译\n" +
  "- 只译说明性文字;术语首次出现可附英文原名\n" +
  "- 保持 Markdown 结构与标题层级不变\n" +
  "- 只输出译文,不要解释";

/**
 * HTTP 契约(v0,见 docs/specs/http-api-v0.md):面板数据源。
 * - 读端点:skills 列表 / 单个详情 / groups / stats / archive
 * - 写端点:enable / disable / archive / group CRUD(面板按钮即用户显式操作,无需 --yes)
 * - 信封与错误 code 复用 json-contract-v0.md,字段定义不重复发明
 * - 服务只绑 127.0.0.1;storeRoot/home 可注入(沙箱测试)
 */

export interface UiAppOptions {
  /** 库存根;null = 未配置(端点返回 store-not-configured) */
  storeRoot?: string | null;
  /** home 解析基座(沙箱测试注入;缺省 resolveHome()) */
  home?: string;
  /** web 静态产物根(缺省 apps/web/dist;测试注入临时目录) */
  webRoot?: string;
  /** 翻译实现注入(测试替身隔离网络;缺省 chatCompletion) */
  translateImpl?: typeof chatCompletion;
  /** 分析用的 chat 替身(测试隔离真实网络;缺省 chatCompletion) */
  analyzeChat?: typeof chatCompletion;
  /** GitHub/skills.sh 拉取用的 fetch 替身(测试隔离真实网络) */
  fetchImpl?: typeof fetch;
}

/** 默认静态根:编译后位于 packages/cli/dist/,上三级到仓库根,再进 apps/web/dist。 */
function defaultWebRoot(): string {
  return fileURLToPath(new URL("../../../apps/web/dist", import.meta.url));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
};

/** 静态产物缺失时的可操作提示页(而不是裸 404)。 */
function notFoundPage(): string {
  return [
    "<!doctype html><html lang='zh'><meta charset='utf-8'><title>skill-hub ui</title>",
    "<body style='font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#030712'>",
    "<h1 style='font-size:1.25rem'>面板尚未构建</h1>",
    "<p>本地数据服务已就绪,但静态面板产物不存在。先构建:</p>",
    "<p style='font-family:ui-monospace,monospace;font-size:.875rem;background:#f9fafb;padding:.75rem;border-radius:.5rem'>pnpm --filter @skills-hub/web build</p>",
    "<p>构建完成后刷新本页即可。API 端点不受影响:<a href='/api/health'>/api/health</a></p>",
    "</body></html>",
  ].join("");
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
  storeRoot?: string | null,
): Promise<{ clientId: string; skillsDir: string } | null> {
  const base = scope === "project" ? process.cwd() : home;
  const opts = storeRoot !== undefined && storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined;
  const roots = scope === "project" ? await discoverClientRootsAt(base, opts) : await discoverClientRoots(base, opts);
  const root = roots.find((r) => r.clientId === clientId);
  return root === undefined ? null : { clientId: root.clientId, skillsDir: root.skillsDir };
}

export function createUiApp(opts: UiAppOptions = {}): Hono {
  const app = new Hono();
  const storeRoot = opts.storeRoot === undefined ? null : opts.storeRoot;
  const home = opts.home ?? resolveHome();
  const translate = opts.translateImpl ?? chatCompletion;
  const analyzeChat = opts.analyzeChat ?? chatCompletion;
  const fetchImpl = opts.fetchImpl;
  const webRoot = opts.webRoot ?? defaultWebRoot();

  const err = (c: Context, command: string, code: string, message: string, status: 400 | 404 | 409 | 422 | 500 | 502 | 503) =>
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

  app.get("/api/skills/:hash/links", (c) =>
    withStore(c, "skill-links", async (root) => {
      const needle = c.req.param("hash");
      const skills = await readStoreIndex(root);
      const hit = skills.find((s) => s.hash.startsWith(needle.toLowerCase())) ?? skills.find((s) => s.dirName === needle);
      if (hit === undefined) return err(c, "skill-links", "not-found", "未找到: " + needle, 404);
      const ledger = await readLinksLedger(root);
      const roots = await discoverClientRoots(home, storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined);
      const links = [];
      for (const r of roots) {
        const inLedger = ledger.some((e) => e.clientId === r.clientId && e.entryName === hit.dirName);
        const status = await classifyClientLink(path.join(r.skillsDir, hit.dirName), inLedger);
        links.push({ clientId: r.clientId, state: status.state, detail: status.detail });
      }
      return c.json({ ok: true, command: "skill-links", hash: hit.hash, links });
    }),
  );

  app.get("/api/groups", (c) =>
    withStore(c, "groups", async (root) => {
      const groups = await readGroups(root);
      return c.json({ ok: true, command: "groups", version: groups.version, groups: groups.groups });
    }),
  );

  const GROUP_ID_RE = /^[a-z][a-z0-9-]*$/;

  const resolveMemberHashes = (needles: string[], skills: SkillRecord[]): { hashes: string[] } | { message: string } => {
    const hashes: string[] = [];
    for (const n of needles) {
      const needle = n.trim();
      if (needle === "") return { message: "hashes 含空项" };
      const hit =
        skills.find((s) => s.hash === needle) ??
        skills.find((s) => s.hash.startsWith(needle.toLowerCase())) ??
        skills.find((s) => s.dirName === needle);
      if (hit === undefined) return { message: "未找到: " + needle };
      hashes.push(hit.hash);
    }
    return { hashes };
  };

  app.post("/api/groups", (c) =>
    withStore(c, "group", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { id?: unknown; name?: unknown; description?: unknown } | null;
      const id = typeof raw?.id === "string" ? raw.id.trim() : "";
      if (id === "" || !GROUP_ID_RE.test(id)) {
        return err(c, "group", "bad-usage", "id 须为小写字母开头、可含数字与连字符", 400);
      }
      const name = typeof raw?.name === "string" && raw.name.trim() !== "" ? raw.name.trim() : id;
      const description = typeof raw?.description === "string" ? raw.description : "";
      const current = await readGroups(root);
      if (current.groups.some((g) => g.id === id)) return err(c, "group", "group-exists", "分组已存在: " + id, 409);
      await createGroup(root, { id, name, description });
      return c.json({ ok: true, command: "group", verb: "create", id, name, description });
    }),
  );

  app.patch("/api/groups/:id", (c) =>
    withStore(c, "group", async (root) => {
      const id = c.req.param("id") ?? "";
      const raw = (await c.req.json().catch(() => null)) as { name?: unknown; description?: unknown } | null;
      const name = typeof raw?.name === "string" ? raw.name.trim() : undefined;
      const description = typeof raw?.description === "string" ? raw.description : undefined;
      if ((name === undefined || name === "") && description === undefined) {
        return err(c, "group", "bad-usage", "body 需要 name 或 description", 400);
      }
      const current = await readGroups(root);
      const g = current.groups.find((x) => x.id === id);
      if (g === undefined) return err(c, "group", "group-not-found", "分组不存在: " + id, 404);
      if (name !== undefined && name !== "") g.name = name;
      if (description !== undefined) g.description = description;
      await writeGroups(root, current);
      return c.json({ ok: true, command: "group", verb: "rename", id, name: g.name, description: g.description });
    }),
  );

  app.delete("/api/groups/:id", (c) =>
    withStore(c, "group", async (root) => {
      const id = c.req.param("id") ?? "";
      try {
        const memberCount = await deleteGroup(root, id);
        return c.json({ ok: true, command: "group", verb: "delete", id, memberCount });
      } catch {
        return err(c, "group", "group-not-found", "分组不存在: " + id, 404);
      }
    }),
  );

  app.post("/api/groups/:id/members", (c) =>
    withStore(c, "group", async (root) => {
      const id = c.req.param("id") ?? "";
      const raw = (await c.req.json().catch(() => null)) as { hashes?: unknown; action?: unknown } | null;
      const action = raw?.action === "remove" ? "remove" : raw?.action === "add" ? "add" : "";
      const hashesIn = Array.isArray(raw?.hashes) ? raw.hashes.filter((h): h is string => typeof h === "string") : [];
      if (action === "" || hashesIn.length === 0) {
        return err(c, "group", "bad-usage", "body 需要 { hashes: string[], action: add|remove }", 400);
      }
      const current = await readGroups(root);
      if (!current.groups.some((g) => g.id === id)) return err(c, "group", "group-not-found", "分组不存在: " + id, 404);
      const resolved = resolveMemberHashes(hashesIn, await readStoreIndex(root));
      if ("message" in resolved) return err(c, "group", "not-found", resolved.message, 404);
      const changed =
        action === "add"
          ? await addSkillToGroups(root, resolved.hashes, [id])
          : await removeSkillFromGroups(root, resolved.hashes, [id]);
      return c.json({ ok: true, command: "group", verb: action, id, hashes: resolved.hashes, changed });
    }),
  );

  app.get("/api/stats", (c) =>
    withStore(c, "stats", async (root) => {
      const stats = await readUsageStats(root);
      return c.json({ ok: true, command: "stats", stats, ranking: usageRanking(stats) });
    }),
  );

  app.get("/api/verify", (c) =>
    withStore(c, "verify", async (root) => {
      const report = await performVerify(root);
      return c.json({ ok: true, command: "verify", ...report });
    }),
  );

  app.get("/api/doctor", (c) =>
    withStore(c, "doctor", async (root) => {
      const report = await collectDoctorReport(home, root);
      return c.json({ ok: true, command: "doctor", ...report });
    }),
  );

  app.get("/api/backups", (c) =>
    withStore(c, "backup", async (root) => {
      const latest = await readLatestSnapshotId(root);
      const snapshots = await listBackupSnapshots(root);
      return c.json({ ok: true, command: "backup", verb: "list", storeRoot: root, latest, snapshots });
    }),
  );

  app.get("/api/archive", (c) =>
    withStore(c, "archive", async (root) => {
      const archived = await listArchivedSkills(root);
      return c.json({ ok: true, command: "archive", verb: "list", archiveDir: path.join(root, "archive"), archived });
    }),
  );

  // ---- 翻译代理(#38):本地服务代发,密钥绝不出现在前端/网络响应/日志 ----
  app.post("/api/translate", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null;
    if (body === null || typeof body?.text !== "string" || body.text === "") {
      return err(c, "translate", "bad-usage", "body 需要 { text: string }", 400);
    }
    const res = await translate(
      [
        { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
        { role: "user", content: body.text.slice(0, MAX_TRANSLATE_CHARS) },
      ],
      { timeoutMs: 60_000 },
    );
    if (!res.ok) {
      return err(c, "translate", res.code, res.message, res.code === "not-configured" ? 503 : 502);
    }
    return c.json({ ok: true, command: "translate", text: res.content });
  });

  app.post("/api/analyze", (c) =>
    withStore(c, "analyze", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { target?: unknown } | null;
      const target = typeof raw?.target === "string" ? raw.target.trim() : "";
      if (target === "") return err(c, "analyze", "bad-usage", "body 需要 { target: string }", 400);
      const res = await performAnalyze(root, target, { chat: analyzeChat, allowLocalPath: false });
      if (!res.ok) {
        const status = res.code === "bad-usage" ? 400 : res.code === "not-found" ? 404 : res.code === "not-configured" ? 503 : 502;
        return err(c, "analyze", res.code, res.message, status);
      }
      return c.json({ ok: true, command: "analyze", target: res.target, similar: res.similar, conflict: res.conflict });
    }),
  );

  app.post("/api/share", (c) =>
    withStore(c, "share", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { target?: unknown; repo?: unknown } | null;
      const target = typeof raw?.target === "string" ? raw.target.trim() : "";
      if (target === "") return err(c, "share", "bad-usage", "body 需要 { target: string }", 400);
      const shareOpts: { dryRun: false; fetchImpl?: typeof fetch; repo?: string } = { dryRun: false };
      if (fetchImpl !== undefined) shareOpts.fetchImpl = fetchImpl;
      if (typeof raw?.repo === "string" && raw.repo.trim() !== "") shareOpts.repo = raw.repo.trim();
      const res = await performShare(root, target, shareOpts);
      if (!res.ok) {
        const status = res.code === "bad-usage" ? 400 : res.code === "not-found" ? 404 : res.code === "remote-conflict" ? 409 : res.code === "auth-required" ? 503 : 502;
        return err(c, "share", res.code, res.message, status);
      }
      return c.json({ ok: true, command: "share", dirName: res.dirName, url: res.url, idempotent: res.idempotent, dryRun: res.dryRun });
    }),
  );

  app.post("/api/backups/preview", (c) =>
    withStore(c, "backups-preview", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { snapshotId?: unknown } | null;
      const snapshotId = typeof raw?.snapshotId === "string" && raw.snapshotId.trim() !== "" ? raw.snapshotId.trim() : undefined;
      const preview = snapshotId === undefined
        ? await previewRestoreClientSkills(root, home)
        : await previewRestoreClientSkills(root, home, snapshotId);
      if (!preview.ok) {
        const status = preview.code === "not-found" ? 404 : 409;
        return err(c, "backups-preview", preview.code, preview.message, status);
      }
      const pointerDir = path.dirname(path.join(home, POINTER_REL));
      const asideStore = root + ".pre-reinit";
      const pointerRel = path.relative(root, pointerDir);
      const pointerMovesWithStore =
        path.resolve(root) === path.resolve(home) ||
        pointerRel === "" ||
        (!pointerRel.startsWith("..") && !path.isAbsolute(pointerRel));
      return c.json({
        ok: true,
        command: "backups-preview",
        snapshotId: preview.snapshotId,
        dryRun: true,
        clients: preview.clients,
        skills: preview.skills,
        files: preview.files,
        links: preview.links,
        wouldRestore: preview.wouldRestore,
        skippedOwnDirs: preview.skippedOwnDirs,
        asideStore,
        asidePointer: pointerMovesWithStore ? asideStore : pointerDir + ".pre-reinit",
      });
    }),
  );

  app.post("/api/reset", (c) =>
    withStore(c, "reset", async () => {
      const raw = (await c.req.json().catch(() => null)) as { snapshotId?: unknown; confirm?: unknown } | null;
      if (raw?.confirm !== "reset") return err(c, "reset", "bad-usage", "body 需要 { confirm: \"reset\" }", 400);
      const snapshotId = typeof raw.snapshotId === "string" && raw.snapshotId.trim() !== "" ? raw.snapshotId.trim() : undefined;
      // 动态 import,避免与 reset-cmds → ui-server 形成静态环。
      const { performReset } = await import("./reset-cmds.js");
      const result = await performReset(snapshotId === undefined ? { home } : { home, snapshotId });
      if (!result.ok) {
        const status =
          result.code === "store-not-configured" ? 503
          : result.code === "not-found" ? 404
          : result.code === "io-error" ? 500
          : 409;
        return err(c, "reset", result.code, result.message, status);
      }
      return c.json({
        ok: true,
        command: "reset",
        storeRoot: result.storeRoot,
        snapshotId: result.snapshotId,
        asideStore: result.asideStore,
        asidePointer: result.asidePointer,
        adopted: result.adopted,
      });
    }),
  );

  app.get("/api/clients", (c) =>
    discoverClientRoots(home, storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined).then((roots) =>
      c.json({ ok: true, command: "clients", clients: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })) }),
    ),
  );

  app.get("/api/clients/:clientId/skill-states", (c) =>
    withStore(c, "client-skill-states", async (root) => {
      const clientId = c.req.param("clientId");
      const roots = await discoverClientRoots(home, storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined);
      const found = roots.find((r) => r.clientId === clientId);
      if (found === undefined) return err(c, "client-skill-states", "not-found", "未找到客户端: " + clientId, 404);
      const skills = await readStoreIndex(root);
      const ledger = await readLinksLedger(root);
      const rows: { hash: string; state: ClientLinkState; detail: string }[] = [];
      for (const s of skills) {
        const inLedger = ledger.some((e) => e.clientId === clientId && e.entryName === s.dirName);
        const status = await classifyClientLink(path.join(found.skillsDir, s.dirName), inLedger);
        rows.push({ hash: s.hash, state: status.state, detail: status.detail });
      }
      const enabled = rows.filter((r) => r.state === "managed").length;
      return c.json({
        ok: true,
        command: "client-skill-states",
        clientId,
        skillsDir: found.skillsDir,
        enabled,
        total: skills.length,
        rows,
      });
    }),
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
    const client = await resolveClientSkillsDirAt(home, body.clientId, body.scope, storeRoot);
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

  // ---- 内容查看端点(#36) ----

  /** 按 hash 前缀或 dirName 解析到 skill 目录;找不到返回 null。 */
  const resolveSkillDir = async (root: string, needle: string): Promise<string | null> => {
    const skills = await readStoreIndex(root);
    let dirName: string;
    try {
      const hit = resolveNames(needle, skills)[0];
      if (hit === undefined) return null;
      dirName = hit;
    } catch {
      return null;
    }
    return path.join(root, "skills", dirName);
  };

  app.get("/api/skills/:hash/tree", (c) =>
    withStore(c, "skill-tree", async (root) => {
      const skillDir = await resolveSkillDir(root, c.req.param("hash") ?? "");
      if (skillDir === null) return err(c, "skill-tree", "not-found", "未找到: " + c.req.param("hash"), 404);
      const res = await listSkillFiles(skillDir);
      if (!res.ok) return err(c, "skill-tree", res.code, res.message, 500);
      return c.json({ ok: true, command: "skill-tree", dirName: path.basename(skillDir), entries: res.entries, truncated: res.truncated });
    }),
  );

  app.get("/api/skills/:hash/file", (c) =>
    withStore(c, "skill-file", async (root) => {
      const skillDir = await resolveSkillDir(root, c.req.param("hash") ?? "");
      if (skillDir === null) return err(c, "skill-file", "not-found", "未找到: " + c.req.param("hash"), 404);
      const rel = c.req.query("path") ?? "";
      if (rel === "") return err(c, "skill-file", "bad-usage", "缺少 path 查询参数(?path=SKILL.md)", 400);
      const res = await readSkillFile(skillDir, rel);
      if (!res.ok) {
        const status = res.code === "outside" ? 400 : res.code === "not-found" ? 404 : res.code === "binary" || res.code === "too-large" ? 422 : 500;
        return err(c, "skill-file", res.code, res.message, status);
      }
      return c.json({ ok: true, command: "skill-file", dirName: path.basename(skillDir), path: rel, content: res.content, sizeBytes: res.sizeBytes });
    }),
  );

  /** 编辑写回(#37):PUT body { content },原子写 + 版本追溯 + 哈希更新。 */
  app.put("/api/skills/:hash/file", (c) =>
    withStore(c, "skill-file-save", async (root) => {
      const skillDir = await resolveSkillDir(root, c.req.param("hash") ?? "");
      if (skillDir === null) return err(c, "skill-file-save", "not-found", "未找到: " + c.req.param("hash"), 404);
      const rel = c.req.query("path") ?? "";
      if (rel === "") return err(c, "skill-file-save", "bad-usage", "缺少 path 查询参数(?path=SKILL.md)", 400);
      const body = (await c.req.json().catch(() => null)) as { content?: unknown } | null;
      if (body === null || typeof body?.content !== "string") {
        return err(c, "skill-file-save", "bad-usage", "body 需要 { content: string }", 400);
      }
      const res = await saveSkillFile({ storeRoot: root, skillDir, relPath: rel, content: body.content });
      if (!res.ok) {
        const status = res.code === "outside" ? 400 : res.code === "too-large" ? 422 : 500;
        return err(c, "skill-file-save", res.code, res.message, status);
      }
      return c.json({ ok: true, command: "skill-file-save", dirName: path.basename(skillDir), path: rel, hash: res.newHash });
    }),
  );

  app.post("/api/skills/:hash/enable", linkEndpoint("enable"));
  app.post("/api/skills/:hash/disable", linkEndpoint("disable"));

  interface LinksBatchBody {
    hashes: string[];
    clientIds: string[];
    action: "enable" | "disable";
    scope: "global" | "project";
  }

  const parseLinksBatch = async (c: Context): Promise<LinksBatchBody | { error: string }> => {
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (raw === null) return { error: "body 需要 JSON { hashes, clientIds, action }" };
    const hashes = Array.isArray(raw.hashes) ? raw.hashes.filter((h): h is string => typeof h === "string" && h.trim() !== "") : [];
    const clientIds = Array.isArray(raw.clientIds) ? raw.clientIds.filter((id): id is string => typeof id === "string" && id.trim() !== "") : [];
    const action = raw.action === "disable" ? "disable" : raw.action === "enable" ? "enable" : null;
    if (hashes.length === 0 || clientIds.length === 0 || action === null) {
      return { error: "body 需要非空 hashes[]、clientIds[] 与 action: enable|disable" };
    }
    return { hashes, clientIds, action, scope: raw.scope === "project" ? "project" : "global" };
  };

  const resolveBatchRequests = async (
    root: string,
    body: LinksBatchBody,
  ): Promise<{ ok: true; action: "enable" | "disable"; items: LinkChangeRequest[] } | { ok: false; code: "not-found"; message: string }> => {
    const skills = await readStoreIndex(root);
    const dirNames: string[] = [];
    for (const needle of body.hashes) {
      try {
        const name = resolveNames(needle, skills)[0];
        if (name === undefined) return { ok: false, code: "not-found", message: "未找到 skill: " + needle };
        if (!dirNames.includes(name)) dirNames.push(name);
      } catch {
        return { ok: false, code: "not-found", message: "未找到 skill: " + needle };
      }
    }
    const items: LinkChangeRequest[] = [];
    for (const clientId of body.clientIds) {
      const client = await resolveClientSkillsDirAt(home, clientId, body.scope, storeRoot);
      if (client === null) return { ok: false, code: "not-found", message: "未找到客户端: " + clientId };
      items.push({ storeRoot: root, clientId: client.clientId, scope: body.scope, skillsDir: client.skillsDir, dirNames });
    }
    return { ok: true, action: body.action, items };
  };

  app.post("/api/links/preview", (c) =>
    withStore(c, "links-preview", async (root) => {
      const parsed = await parseLinksBatch(c);
      if ("error" in parsed) return err(c, "links-preview", "bad-usage", parsed.error, 400);
      const resolved = await resolveBatchRequests(root, parsed);
      if (!resolved.ok) return err(c, "links-preview", resolved.code, resolved.message, 404);
      const wouldCreate: LinkDiffItem[] = [];
      const wouldRemove: LinkDiffItem[] = [];
      const conflicts: LinkConflictItem[] = [];
      for (const item of resolved.items) {
        const preview = await previewLinkChange(item, resolved.action);
        wouldCreate.push(...preview.wouldCreate);
        wouldRemove.push(...preview.wouldRemove);
        conflicts.push(...preview.conflicts);
      }
      return c.json({
        ok: true,
        command: "links-preview",
        action: resolved.action,
        add: wouldCreate.length,
        remove: wouldRemove.length,
        conflictCount: conflicts.length,
        wouldCreate,
        wouldRemove,
        conflicts,
      });
    }),
  );

  app.post("/api/links/apply", (c) =>
    withStore(c, "links-apply", async (root) => {
      const parsed = await parseLinksBatch(c);
      if ("error" in parsed) return err(c, "links-apply", "bad-usage", parsed.error, 400);
      const resolved = await resolveBatchRequests(root, parsed);
      if (!resolved.ok) return err(c, "links-apply", resolved.code, resolved.message, 404);
      const result = await applyLinkBatch(resolved.items, resolved.action);
      if (!result.ok) {
        return c.json(
          { ok: false, command: "links-apply", code: result.code, message: result.message, conflicts: result.conflicts ?? [] },
          409,
        );
      }
      return c.json({
        ok: true,
        command: "links-apply",
        action: resolved.action,
        created: result.created,
        removed: result.removed,
      });
    }),
  );

  app.post("/api/adopt", (c) =>
    withStore(c, "adopt", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { source?: unknown } | null;
      const source = typeof raw?.source === "string" ? raw.source.trim() : "";
      if (source === "") return err(c, "adopt", "bad-usage", "body 需要 { source: string }", 400);
      const report = await performAdopt(root, [source], fetchImpl !== undefined ? { fetchImpl } : {});
      if (report.fetchFailed && report.outcomes.length === 0) {
        return err(c, "adopt", "github-fetch-failed", report.fetchMessage ?? "拉取失败", 502);
      }
      return c.json({
        ok: true,
        command: "adopt",
        dryRun: false,
        storeRoot: root,
        adopted: report.adopted,
        duplicates: report.duplicates,
        conflicts: report.conflicts,
        invalid: report.invalid,
        fetchFailed: report.fetchFailed,
        outcomes: report.outcomes,
      });
    }),
  );

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

  app.post("/api/skills/:hash/restore", (c) =>
    withStore(c, "restore", async (root) => {
      const needle = c.req.param("hash") ?? "";
      const res = await restoreArchivedSkill(root, needle);
      if (!res.ok) {
        const status = res.code === "not-found" ? 404 : res.code === "conflict" ? 409 : 500;
        return err(c, "restore", res.code, res.message, status);
      }
      return c.json({ ok: true, command: "restore", dirName: res.dirName, hash: res.hash, archiveFile: res.archiveFile });
    }),
  );

  // ---- 静态面板(SPA):一条命令起完整体验 ----
  // 路径按 webRoot 约束解析(防目录穿越);任何静态缺失都给构建指引页,不裸 404。

  const serveFile = async (c: Context, rel: string): Promise<Response> => {
    const relPath = rel === "/" ? "index.html" : rel;
    const safe = path.resolve(webRoot, "./" + relPath);
    if (safe !== webRoot && !safe.startsWith(webRoot + path.sep)) return c.text("Not found", 404);
    const file = await readFile(safe).catch(() => null);
    if (file === null) return c.html(notFoundPage(), 200);
    const ext = path.extname(safe).toLowerCase();
    return new Response(file, { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
  };

  app.get("/", (c) => serveFile(c, "index.html"));
  app.get("/assets/*", (c) => serveFile(c, c.req.path));
  app.get("*", (c) => {
    // API 未知路径仍返回 JSON 信封,不被 SPA fallback 吃掉
    if (c.req.path.startsWith("/api/")) return err(c, "unknown", "not-found", "未知 API: " + c.req.path, 404);
    return serveFile(c, "index.html"); // 前端路由刷新不 404
  });

  return app;
}

/** 启动参数具名,避免把 storeRoot 按位置误传成 home(见 #95)。 */
export interface StartUiServerOptions {
  port?: number;
  /** 客户端发现的 home 基座,不是库存根 */
  home?: string;
}

export async function startUiServer(opts: StartUiServerOptions = {}): Promise<void> {
  const port = opts.port ?? DEFAULT_UI_PORT;
  const h = opts.home ?? resolveHome();
  const storeOpts: StoreRootOptions = { pointerFilePath: path.join(h, POINTER_REL) };
  if (opts.home !== undefined && opts.home !== "") storeOpts.cliHome = opts.home;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") storeOpts.envHome = envHome;
  const resolved = await resolveStoreRoot(storeOpts);
  const storeRoot = resolved.ok ? resolved.storeRoot : null;
  serve({ fetch: createUiApp({ storeRoot, home: h }).fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log("skill-hub ui: http://127.0.0.1:" + info.port + "/api/skills" + (storeRoot === null ? " (库存未配置)" : ""));
  });
}
