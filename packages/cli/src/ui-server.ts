import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdaptorServer } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  discoverClientRoots,
  listArchivedSkills,
  listBackupSnapshots,
  previewRestoreClientSkills,
  readLatestSnapshotId,
  readLinksLedger,
  readStoreIndex,
  readUsageStats,
  normalizeHubPaths,
  type HubPaths,
  usageRanking,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { performAdopt, performInit, performVerify, POINTER_REL } from "./store-cmds.js";
import { resolveSkill } from "./resolve-skill.js";
import { resolveConfiguredHubPaths } from "./store-shared.js";
import { collectDoctorReport } from "./doctor.js";
import { performAnalyze, type AnalyzeGenerate } from "./analyze.js";
import { performShare } from "./share.js";
import {
  createAgentUIStreamResponse,
  safeValidateUIMessages,
  streamText,
  type LanguageModel,
} from "ai";
import { mapLlmError, scrub } from "./llm/errors.js";
import {
  createQiniuModel,
  notConfiguredMessage,
  qiniuApiKey,
  resolveModel,
  STREAM_IDLE_TIMEOUT_MS,
} from "./llm/provider.js";
import { readTranslation, writeTranslation } from "./translations.js";
import { createSkillsHubAgent, parseWritePolicy } from "./agent/agent.js";
import { registerAiConnection, availableModels } from "./ui-ai.js";
import type { AiConnectionStorage } from "./llm/connection.js";
import { createAgentTools, type ToolEnv } from "./agent/tools.js";
import { attachVisibleIn, clientDiscoverOpts, err, skillLookupErr, setUiPaths, withStore, type DesktopPreferences, type UiRouteContext } from "./ui-http.js";
import { registerGroupRoutes } from "./ui-groups.js";
import { registerDraftRoutes } from "./ui-drafts.js";
import { registerContentRoutes } from "./ui-content.js";
import { registerLinkRoutes } from "./ui-links.js";
import { registerReconcileRoutes } from "./ui-reconcile.js";
import { registerConflictRoutes } from "./ui-conflicts.js";
import { checkBundledSelfSkill, installInitialGuide } from "./self-skill.js";
import { registerSettingsRoutes } from "./ui-settings.js";
import { readStorePreferences } from "./store-preferences.js";
import { registerGitRoutes } from "./ui-git.js";
import { archiveManagedSkill, restoreManagedSkill } from "./skill-write-ops.js";
import { createGhDeviceLogin } from "./git/index.js";
import type { GitRuntime } from "./git-ops.js";

export const DEFAULT_UI_PORT = 4321;

/** 翻译代理(#38)常量:单次截断上限防滥用;流式下发,空闲超时由 STREAM_IDLE_TIMEOUT_MS 管。 */
export const MAX_TRANSLATE_CHARS = 200_000;

/** 写请求体上限(2 MB),防大载荷耗尽内存。 */
export const MAX_API_BODY_BYTES = 2 * 1024 * 1024;

/** 翻译系统提示:保留代码块与 frontmatter 原文,只译说明性文字。 */
export const TRANSLATE_SYSTEM_PROMPT =
  "你是 skill 文档翻译器。把用户给的 Markdown 翻译成简体中文,规则:\n" +
  "- 代码块与行内代码、frontmatter(--- 之间的 YAML)、URL 一律保留原文,绝不翻译\n" +
  "- 只译说明性文字;术语首次出现可附英文原名\n" +
  "- 保持 Markdown 结构与标题层级不变\n" +
  "- 只输出译文,不要解释";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isValidPort(portStr: string | undefined): boolean {
  if (portStr === undefined) return true;
  const n = Number(portStr);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function isAllowedHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === "skills-hub") return true;
  const m = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d{1,5}))?$/.exec(h);
  return m !== null && isValidPort(m[2]);
}

function isAllowedOrigin(origin: string): boolean {
  const o = origin.trim().toLowerCase();
  if (o === "app://skills-hub") return true;
  const m = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::(\d{1,5}))?$/.exec(o);
  return m !== null && isValidPort(m[2]);
}

async function measureBodyBytes(
  req: Request,
  maxBytes: number,
): Promise<{ tooLarge: true } | { tooLarge: false; bytes: number }> {
  const cl = req.headers.get("content-length");
  if (cl !== null) {
    const parsed = Number(cl);
    if (Number.isFinite(parsed) && parsed > maxBytes) return { tooLarge: true };
  }
  if (req.body === null) return { tooLarge: false, bytes: 0 };
  const cloned = req.clone();
  if (cloned.body === null) return { tooLarge: false, bytes: 0 };
  const reader = cloned.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        return { tooLarge: true };
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { tooLarge: false, bytes };
}

/**
 * HTTP 契约(v0,见 docs/specs/http-api-v0.md):面板数据源。
 * createUiApp 只做路由注册与注入;写操作的业务 if 在 perform*(分组/草稿/链接)或各 register* 模块。
 * 服务只绑 127.0.0.1;storeRoot/home 可注入(沙箱测试)。
 */

export interface UiAppOptions {
  aiStorage?: AiConnectionStorage | undefined;
  selfSkillDir?: string;
  /** 库存根;null = 未配置(端点返回 store-not-configured) */
  storeRoot?: string | null;
  paths?: HubPaths | null;
  desktop?: boolean;
  onDesktopPreferences?: (preferences: DesktopPreferences) => void;
  gitRuntime?: GitRuntime;
  /** home 解析基座(沙箱测试注入;缺省 resolveHome()) */
  home?: string;
  /** web 静态产物根(缺省 apps/web/dist;测试注入临时目录) */
  webRoot?: string;
  /** 翻译流式实现注入(测试替身隔离网络) */
  translateStream?: TranslateStreamFn;
  /** 分析生成替身(测试隔离真实网络) */
  analyzeGenerate?: AnalyzeGenerate;
  /** GitHub/skills.sh 拉取用的 fetch 替身(测试隔离真实网络) */
  fetchImpl?: typeof fetch;
  /** Agent / 翻译用的语言模型替身(测试隔离真实网络) */
  languageModel?: LanguageModel;
}

export type TranslateStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export type TranslateStreamFn = (text: string, opts?: { signal?: AbortSignal }) => AsyncIterable<TranslateStreamEvent>;

async function* defaultTranslateStream(
  text: string,
  opts: { signal?: AbortSignal; model?: LanguageModel } = {},
): AsyncGenerator<TranslateStreamEvent> {
  if (opts.model === undefined && qiniuApiKey() === undefined) {
    yield { type: "error", code: "not-configured", message: notConfiguredMessage() };
    return;
  }
  try {
    const streamOpts: Parameters<typeof streamText>[0] = {
      model: opts.model ?? createQiniuModel(resolveModel()),
      system: TRANSLATE_SYSTEM_PROMPT,
      prompt: text,
      timeout: { chunkMs: STREAM_IDLE_TIMEOUT_MS },
      onError: () => {},
    };
    if (opts.signal !== undefined) streamOpts.abortSignal = opts.signal;
    const result = streamText(streamOpts);
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        yield { type: "text", delta: part.text };
      } else if (part.type === "error") {
        const mapped = mapLlmError(part.error);
        yield { type: "error", code: mapped.code, message: mapped.message };
        return;
      } else if (part.type === "abort") {
        yield {
          type: "error",
          code: "aborted",
          message: part.reason !== undefined && part.reason !== "" ? "请求已中止: " + scrub(part.reason) : "请求已中止",
        };
        return;
      }
    }
    yield { type: "done" };
  } catch (e) {
    const mapped = mapLlmError(e);
    yield { type: "error", code: mapped.code, message: mapped.message };
  }
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

export function createUiApp(opts: UiAppOptions = {}): Hono {
  const app = new Hono();
  const home = opts.home ?? resolveHome();
  const translateStream: TranslateStreamFn =
    opts.translateStream ??
    ((text, streamOpts) => {
      const pass: { signal?: AbortSignal; model?: LanguageModel } = {};
      if (streamOpts?.signal !== undefined) pass.signal = streamOpts.signal;
      if (opts.languageModel !== undefined) pass.model = opts.languageModel;
      return defaultTranslateStream(text, pass);
    });
  const analyzeGenerate = opts.analyzeGenerate;
  const fetchImpl = opts.fetchImpl;
  const webRoot = opts.webRoot ?? defaultWebRoot();
  const ctx: UiRouteContext = {
    storeRoot: null, paths: null, home, desktop: opts.desktop === true,
    ...(opts.onDesktopPreferences === undefined ? {} : { onDesktopPreferences: opts.onDesktopPreferences }),
  };
  setUiPaths(ctx, opts.paths === undefined && opts.storeRoot ? normalizeHubPaths(opts.storeRoot) : opts.paths ?? null);

  app.onError((e, c) => {
    const message = scrub(e instanceof Error ? e.message : String(e));
    return err(c, "server", "io-error", message === "" ? "内部服务错误" : message, 500);
  });

  // 本机安全防线:Host 白名单 + 写操作 Origin 白名单 + 2MB 请求体限制 + 非空写体必须 application/json
  app.use("/api/*", async (c, next) => {
    const rawHost = c.req.header("host") ?? new URL(c.req.url).host;
    if (!isAllowedHost(rawHost)) {
      return err(c, "security", "forbidden", "拒绝访问:Host 不在本地白名单", 403);
    }
    if (WRITE_METHODS.has(c.req.method.toUpperCase())) {
      const origin = c.req.header("origin");
      if (origin !== undefined && !isAllowedOrigin(origin)) {
        return err(c, "security", "forbidden", "拒绝跨站写请求:Origin 不在白名单", 403);
      }
      const measured = await measureBodyBytes(c.req.raw, MAX_API_BODY_BYTES);
      if (measured.tooLarge) {
        return err(c, "security", "too-large", "请求体过大(上限 2 MB)", 413);
      }
      const clHeader = c.req.header("content-length");
      const hasNonZeroCl = clHeader !== undefined && Number(clHeader) > 0;
      if (measured.bytes > 0 || hasNonZeroCl) {
        const mediaType = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
        if (mediaType !== "application/json") {
          return err(c, "security", "bad-usage", "写请求非空 body 的 Content-Type 必须为 application/json", 415);
        }
      }
    }
    await next();
  });

  // Let settings or content writes finish before migrating the paths they use.
  let pendingWrite = Promise.resolve();
  app.use("/api/*", async (c, next) => {
    if (!WRITE_METHODS.has(c.req.method.toUpperCase())) return next();
    const previous = pendingWrite;
    let release!: () => void;
    pendingWrite = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      await next();
    } finally {
      release();
    }
  });

  registerAiConnection(app, opts.aiStorage);
  registerGroupRoutes(app, ctx);
  registerDraftRoutes(app, ctx);
  registerContentRoutes(app, ctx);
  registerLinkRoutes(app, ctx);
  registerReconcileRoutes(app, ctx);
  registerConflictRoutes(app, ctx);
  registerSettingsRoutes(app, ctx, opts.gitRuntime);
  registerGitRoutes(app, ctx, opts.gitRuntime);

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/store/init", async (c) => {
    const text = await c.req.text().catch(() => "");
    let raw: { storeRoot?: unknown; skillsRoot?: unknown; guideTargets?: unknown } = {};
    if (text.trim() !== "") {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return err(c, "store-init", "bad-usage", "body 需要 JSON 对象 { skillsRoot?: string }");
        }
        raw = parsed as { storeRoot?: unknown; skillsRoot?: unknown };
      } catch {
        return err(c, "store-init", "bad-usage", "body 需要合法 JSON");
      }
    }
    if (raw.storeRoot !== undefined && typeof raw.storeRoot !== "string") {
      return err(c, "store-init", "bad-usage", "storeRoot 必须为字符串路径");
    }
    if (raw.skillsRoot !== undefined && (typeof raw.skillsRoot !== "string" || raw.storeRoot !== undefined)) {
      return err(c, "store-init", "bad-usage", "skillsRoot 必须单独提供字符串路径");
    }
    const targets = raw.guideTargets;
    if (targets !== undefined && (!Array.isArray(targets) || !targets.every((v: unknown) => typeof v === "string"))) {
      return err(c, "store-init", "bad-usage", "guideTargets 必须是客户端目录数组");
    }
    const res = await performInit(home, typeof raw.skillsRoot === "string" ? { skillsRoot: raw.skillsRoot } : raw.storeRoot);
    if (!res.ok) return err(c, "store-init", res.code, res.message);
    setUiPaths(ctx, res.paths);
    return c.json({
      ok: true,
      command: "store-init",
      storeRoot: res.storeRoot,
      ...res.paths,
      pointerFile: res.pointerFile,
      ...(targets === undefined ? {} : { guide: await installInitialGuide(home, res.paths, targets as string[], opts.selfSkillDir) }),
      layoutCreated: res.layoutCreated,
      builtinGroupsWrote: res.builtinGroupsWrote,
    });
  });

  app.get("/api/skills", (c) =>
    withStore(ctx, c, "skills", async (root) => {
      const [index, links, { git }] = await Promise.all([
        readStoreIndex(root), readLinksLedger(root), readStorePreferences(ctx.home),
      ]);
      const skills = attachVisibleIn(index, links);
      return c.json({ ok: true, command: "skills", storeRoot: root.stateRoot, total: skills.length, skills, gitEnabled: git.enabled });
    }),
  );

  app.get("/api/skills/:hash", (c) =>
    withStore(ctx, c, "skill", async (root) => {
      const needle = c.req.param("hash");
      const skills = attachVisibleIn(await readStoreIndex(root), await readLinksLedger(root));
      const hit = resolveSkill(needle, skills);
      if (!hit.ok) return skillLookupErr(c, "skill", hit);
      return c.json({ ok: true, command: "skill", skill: hit.skill });
    }),
  );

  app.get("/api/stats", (c) =>
    withStore(ctx, c, "stats", async (root) => {
      const stats = await readUsageStats(root);
      return c.json({ ok: true, command: "stats", stats, ranking: usageRanking(stats) });
    }),
  );

  app.get("/api/verify", (c) =>
    withStore(ctx, c, "verify", async (root) => {
      const report = await performVerify(root);
      return c.json({ ok: true, command: "verify", ...report });
    }),
  );

  app.get("/api/doctor", (c) =>
    withStore(ctx, c, "doctor", async (root) => {
      const report = await collectDoctorReport(home, root);
      return c.json({ ok: true, command: "doctor", ...report });
    }),
  );

  app.get("/api/backups", (c) =>
    withStore(ctx, c, "backup", async (root) => {
      const latest = await readLatestSnapshotId(root);
      const snapshots = await listBackupSnapshots(root);
      return c.json({ ok: true, command: "backup", verb: "list", storeRoot: root.stateRoot, latest, snapshots });
    }),
  );

  app.get("/api/archive", (c) =>
    withStore(ctx, c, "archive", async (root) => {
      const archived = await listArchivedSkills(root);
      return c.json({ ok: true, command: "archive", verb: "list", archiveDir: path.join(root.stateRoot, "archive"), archived });
    }),
  );

  app.post("/api/translate", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { text?: unknown; target?: unknown; path?: unknown } | null;
    if (body === null || typeof body.text !== "string" || body.text === "") {
      return err(c, "translate", "bad-usage", "body 需要 { text: string }");
    }
    const sourceText = body.text;
    // 译文留存(#208):target+path 都带且能解析时,流式成功结束后 best-effort 落盘;绝不写 skills/ 原件
    let persist: { root: string; hash: string; rel: string } | null = null;
    const currentRoot = ctx.storeRoot;
    if (currentRoot !== null && typeof body.target === "string" && body.target.trim() !== "" && typeof body.path === "string" && body.path.trim() !== "") {
      const hit = resolveSkill(body.target.trim(), await readStoreIndex(currentRoot).catch(() => []));
      if (hit.ok) persist = { root: currentRoot, hash: hit.skill.hash, rel: body.path.trim() };
    }
    return streamSSE(c, async (stream) => {
      let full = "";
      for await (const ev of translateStream(sourceText.slice(0, MAX_TRANSLATE_CHARS), { signal: c.req.raw.signal })) {
        if (ev.type === "text") {
          full += ev.delta;
          await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: ev.delta }) });
        } else if (ev.type === "error") {
          await stream.writeSSE({ event: "error", data: JSON.stringify({ code: ev.code, message: ev.message }) });
          return;
        } else if (ev.type === "done") {
          if (persist !== null && full.trim() !== "") {
            await writeTranslation(persist.root, persist.hash, persist.rel, full);
          }
          await stream.writeSSE({ event: "done", data: "{}" });
          return;
        }
      }
    });
  });

  // 译文缓存读取(#208):命中直接复用,不再调模型。键 = 记录哈希 + 相对路径。
  app.get("/api/skills/:hash/translation", (c) =>
    withStore(ctx, c, "skill-translation", async (root) => {
      const needle = c.req.param("hash") ?? "";
      const hit = resolveSkill(needle, await readStoreIndex(root));
      if (!hit.ok) return skillLookupErr(c, "skill-translation", hit);
      const rel = c.req.query("path") ?? "";
      if (rel === "") return err(c, "skill-translation", "bad-usage", "缺少 path 查询参数(?path=SKILL.md)");
      const res = await readTranslation(root.stateRoot, hit.skill.hash, rel);
      if (!res.ok) return err(c, "skill-translation", res.code, res.message, res.code === "translation-not-found" ? 404 : 400);
      return c.json({ ok: true, command: "skill-translation", hash: hit.skill.hash, path: rel, translated: res.content });
    }),
  );

  app.get("/api/agent/models", (c) =>
    c.json({ ok: true, command: "agent-models", ...availableModels() }),
  );

  // Agent 对话(agent-v0.md):不包 withStore——库存未配置时仍可对话,工具返回可读文本。
  app.post("/api/agent/chat", async (c) => {
    if (opts.languageModel === undefined && qiniuApiKey() === undefined) {
      return err(c, "agent-chat", "not-configured", notConfiguredMessage());
    }
    const raw = (await c.req.json().catch(() => null)) as { messages?: unknown; model?: unknown; writePolicy?: unknown } | null;
    const messages = raw?.messages;
    if (!Array.isArray(messages)) return err(c, "agent-chat", "bad-usage", "body 需要 { messages: UIMessage[] }(不含 system)");
    if (messages.some((m) => typeof m === "object" && m !== null && (m as { role?: unknown }).role === "system")) {
      return err(c, "agent-chat", "bad-usage", "body 需要 { messages: UIMessage[] }(不含 system)");
    }
    const choices = availableModels();
    const modelId = choices.models.find(item => item.id === raw?.model)?.id ?? choices.defaultModel;
    const writePolicy = parseWritePolicy(raw?.writePolicy);
    const currentRoot = ctx.storeRoot;
    const clients = (await discoverClientRoots(home, clientDiscoverOpts(ctx.paths))).map((r) => r.clientId);
    const env: ToolEnv = {
      home,
      storeRoot: currentRoot,
      paths: ctx.paths,
    };
    if (fetchImpl !== undefined) env.fetchImpl = fetchImpl;
    if (analyzeGenerate !== undefined) env.analyzeGenerate = analyzeGenerate;
    if (opts.gitRuntime !== undefined) env.gitRuntime = opts.gitRuntime;
    const tools = createAgentTools(env);
    const validated = await safeValidateUIMessages({
      messages,
      tools: tools as NonNullable<Parameters<typeof safeValidateUIMessages>[0]["tools"]>,
    });
    if (!validated.success) {
      return err(c, "agent-chat", "bad-usage", "messages 格式无效: " + scrub(validated.error.message));
    }
    if (validated.data.some(message => message.parts.some(part => part.type === "file" &&
      (!["image/png", "image/jpeg", "image/webp"].includes(part.mediaType) || !part.url.startsWith("data:" + part.mediaType + ";base64,"))))) {
      return err(c, "agent-chat", "bad-usage", "图片附件必须使用内嵌 PNG、JPEG 或 WebP 数据");
    }
    const agent = createSkillsHubAgent({
      model: opts.languageModel ?? createQiniuModel(modelId),
      env,
      clients,
      writePolicy,
    });
    return createAgentUIStreamResponse({
      agent,
      uiMessages: validated.data,
      abortSignal: c.req.raw.signal,
      timeout: { chunkMs: STREAM_IDLE_TIMEOUT_MS },
      sendReasoning: false,
      onError: (e) => mapLlmError(e).message,
    });
  });

  app.post("/api/analyze", (c) =>
    withStore(ctx, c, "analyze", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { target?: unknown } | null;
      const target = typeof raw?.target === "string" ? raw.target.trim() : "";
      if (target === "") return err(c, "analyze", "bad-usage", "body 需要 { target: string }");
      const analyzeOpts = analyzeGenerate !== undefined
        ? { generate: analyzeGenerate, allowLocalPath: false as const }
        : { allowLocalPath: false as const };
      const res = await performAnalyze(root, target, analyzeOpts);
      if (!res.ok) return err(c, "analyze", res.code, res.message);
      return c.json({ ok: true, command: "analyze", target: res.target, similar: res.similar, conflict: res.conflict });
    }),
  );

  app.post("/api/share", (c) =>
    withStore(ctx, c, "share", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { target?: unknown; repo?: unknown } | null;
      const target = typeof raw?.target === "string" ? raw.target.trim() : "";
      if (target === "") return err(c, "share", "bad-usage", "body 需要 { target: string }");
      const shareOpts: { dryRun: false; fetchImpl?: typeof fetch; repo?: string } = { dryRun: false };
      if (fetchImpl !== undefined) shareOpts.fetchImpl = fetchImpl;
      if (typeof raw?.repo === "string" && raw.repo.trim() !== "") shareOpts.repo = raw.repo.trim();
      const res = await performShare(root, target, shareOpts);
      if (!res.ok) return err(c, "share", res.code, res.message);
      return c.json({ ok: true, command: "share", dirName: res.dirName, url: res.url, idempotent: res.idempotent, dryRun: res.dryRun });
    }),
  );

  app.post("/api/backups/preview", (c) =>
    withStore(ctx, c, "backups-preview", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { snapshotId?: unknown } | null;
      const snapshotId = typeof raw?.snapshotId === "string" && raw.snapshotId.trim() !== "" ? raw.snapshotId.trim() : undefined;
      const preview = snapshotId === undefined
        ? await previewRestoreClientSkills(root, home)
        : await previewRestoreClientSkills(root, home, snapshotId);
      if (!preview.ok) return err(c, "backups-preview", preview.code, preview.message);
      const pointerDir = path.dirname(path.join(home, POINTER_REL));
      const asideStore = root.stateRoot + ".pre-reinit";
      const pointerRel = path.relative(root.stateRoot, pointerDir);
      const pointerMovesWithStore =
        path.resolve(root.stateRoot) === path.resolve(home) ||
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
    withStore(ctx, c, "reset", async () => {
      const raw = (await c.req.json().catch(() => null)) as { snapshotId?: unknown; confirm?: unknown } | null;
      if (raw?.confirm !== "reset") return err(c, "reset", "bad-usage", "body 需要 { confirm: \"reset\" }");
      const snapshotId = typeof raw.snapshotId === "string" && raw.snapshotId.trim() !== "" ? raw.snapshotId.trim() : undefined;
      // 动态 import,避免与 reset-cmds → ui-server 形成静态环。
      const { performReset } = await import("./reset-cmds.js");
      const result = await performReset(snapshotId === undefined ? { home } : { home, snapshotId });
      if (!result.ok) return err(c, "reset", result.code, result.message);
      setUiPaths(ctx, await resolveUiHubPaths(home));
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
    discoverClientRoots(home, clientDiscoverOpts(ctx.paths)).then((roots) =>
      c.json({ ok: true, command: "clients", clients: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })) }),
    ),
  );

  app.post("/api/adopt", (c) =>
    withStore(ctx, c, "adopt", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { source?: unknown } | null;
      const source = typeof raw?.source === "string" ? raw.source.trim() : "";
      if (source === "") return err(c, "adopt", "bad-usage", "body 需要 { source: string }");
      const report = await performAdopt(root, [source], { home: ctx.home, ...(fetchImpl === undefined ? {} : { fetchImpl }) });
      if (report.fetchFailed && report.outcomes.length === 0) {
        return err(c, "adopt", "github-fetch-failed", report.fetchMessage ?? "拉取失败");
      }
      return c.json({
        ok: true,
        command: "adopt",
        dryRun: false,
        storeRoot: root.stateRoot,
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
    withStore(ctx, c, "archive", async (root) => {
      const needle = c.req.param("hash");
      const hit = resolveSkill(needle, await readStoreIndex(root));
      if (!hit.ok) return skillLookupErr(c, "archive", hit);
      const dirName = hit.skill.dirName;
      const res = await archiveManagedSkill(ctx.home, root, dirName);
      if (!res.ok) return err(c, "archive", res.code, res.message, 409);
      return c.json({ ok: true, command: "archive", dirName, archiveFile: res.archiveFile, sizeBytes: res.sizeBytes, removedLinks: res.removedLinks });
    }),
  );

  app.post("/api/skills/:hash/restore", (c) =>
    withStore(ctx, c, "restore", async (root) => {
      const needle = c.req.param("hash") ?? "";
      const res = await restoreManagedSkill(ctx.home, root, needle);
      if (!res.ok) return err(c, "restore", res.code, res.message);
      return c.json({ ok: true, command: "restore", dirName: res.dirName, hash: res.hash, archiveFile: res.archiveFile });
    }),
  );

  const serveFile = async (c: Context, rel: string, fallbackHtml: boolean): Promise<Response> => {
    const relPath = rel === "/" ? "index.html" : rel;
    const safe = path.resolve(webRoot, "./" + relPath);
    if (safe !== webRoot && !safe.startsWith(webRoot + path.sep)) return c.text("Not found", 404);
    const file = await readFile(safe).catch(() => null);
    if (file === null) return fallbackHtml ? c.html(notFoundPage(), 200) : c.text("Not found", 404);
    const ext = path.extname(safe).toLowerCase();
    return new Response(file, { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
  };

  app.get("/", (c) => serveFile(c, "index.html", true));
  app.get("/assets/*", (c) => serveFile(c, c.req.path, false));
  app.all("/api/*", (c) => err(c, "unknown", "not-found", "未知 API: " + c.req.path));
  app.get("*", (c) => serveFile(c, "index.html", true));

  return app;
}

/** 启动参数具名,避免把 storeRoot 按位置误传成 home(见 #95)。 */
export interface StartUiServerOptions {
  aiStorage?: AiConnectionStorage | undefined;
  desktop?: boolean;
  onDesktopPreferences?: (preferences: DesktopPreferences) => void;
  gitRuntime?: GitRuntime;
  port?: number;
  /** 客户端发现的 home 基座,不是库存根 */
  home?: string;
  /** web 静态产物根(Electron 等编程式嵌入可覆写) */
  webRoot?: string;
  /** 随包指南目录，默认从 CLI 安装目录或桌面资源解析。 */
  selfSkillDir?: string;
}

export interface UiServerHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function resolveUiHubPaths(home: string): Promise<HubPaths | null> {
  const resolved = await resolveConfiguredHubPaths(home);
  return resolved.ok ? resolved.paths : null;
}

export async function resolveUiStoreRoot(home: string): Promise<string | null> {
  return (await resolveUiHubPaths(home))?.stateRoot ?? null;
}

export async function startUiServer(opts: StartUiServerOptions = {}): Promise<UiServerHandle> {
  const port = opts.port ?? DEFAULT_UI_PORT;
  const h = opts.home ?? resolveHome();
  const paths = await resolveUiHubPaths(h);
  if (paths !== null) await checkBundledSelfSkill(h, paths, opts.selfSkillDir);
  const deviceLogin = opts.gitRuntime?.deviceLogin ?? createGhDeviceLogin(
    opts.gitRuntime?.gh === undefined ? {} : { runner: opts.gitRuntime.gh },
  );
  const appOpts: UiAppOptions = { paths, aiStorage: opts.aiStorage, home: h, desktop: opts.desktop === true, gitRuntime: { ...opts.gitRuntime, deviceLogin } };
  if (opts.onDesktopPreferences !== undefined) appOpts.onDesktopPreferences = opts.onDesktopPreferences;
  if (opts.webRoot !== undefined) appOpts.webRoot = opts.webRoot;
  if (opts.selfSkillDir !== undefined) appOpts.selfSkillDir = opts.selfSkillDir;
  const app = createUiApp(appOpts);
  const server = createAdaptorServer({ fetch: app.fetch, hostname: "127.0.0.1" });

  return new Promise<UiServerHandle>((resolve, reject) => {
    const onStartupError = (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE") {
        reject(new Error(`端口 ${port} 已被占用,请换用 --port 指定其他端口`));
      } else {
        reject(e);
      }
    };
    server.once("error", onStartupError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onStartupError);
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr !== null ? addr.port : port;
      const url = "http://127.0.0.1:" + actualPort;
      console.log("skill-hub ui: " + url + "/api/skills" + (paths === null ? " (库存未配置)" : ""));
      resolve({
        port: actualPort,
        url,
        close: () => {
          deviceLogin.dispose();
          return new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });
  });
}
