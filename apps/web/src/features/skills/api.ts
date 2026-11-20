import { apiRequest } from "@/lib/api-client";
import { parseSseJson, postSse } from "@/lib/sse";
import { fileResourceKey, loadResource, treeResourceKey } from "./async-resource.js";
import { hashesByClient, hashesForApply } from "./batch-links.js";
import type {
  AdoptResponse,
  AnalyzeResponse,
  ArchiveResponse,
  BackupsListResponse,
  BackupsPreviewResponse,
  ClientSkillStatesResponse,
  ClientsResponse,
  DoctorResponse,
  GroupsResponse,
  LinksApplyResponse,
  LinksBatchParams,
  LinksPreviewResponse,
  ResetResponse,
  ShareResponse,
  SkillFileEntry,
  SkillFileResponse,
  SkillRecord,
  SkillsResponse,
  SkillTreeResponse,
  StatsResponse,
  StoreInitResponse,
} from "./types.js";

/** 拉取库存列表;HTTP 失败抛 ApiRequestError(含结构化 code,如 store-not-configured)。 */
export async function fetchCatalog(): Promise<{ storeRoot: string; skills: SkillRecord[] }> {
  const body = await apiRequest<SkillsResponse>("/api/skills");
  return { storeRoot: body.storeRoot, skills: body.skills };
}

/** 初始化技能库存(未配置时由前端引导页触发)。 */
export async function initStore(storeRoot?: string): Promise<StoreInitResponse> {
  const trimmed = storeRoot?.trim() ?? "";
  return apiRequest<StoreInitResponse>("/api/store/init", {
    method: "POST",
    body: trimmed === "" ? {} : { storeRoot: trimmed },
  });
}

export async function createGroup(id: string, name: string, description = ""): Promise<void> {
  await apiRequest<{ ok: true }>("/api/groups", {
    method: "POST",
    body: { id, name, description },
  });
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await apiRequest<{ ok: true }>("/api/groups/" + encodeURIComponent(id), {
    method: "PATCH",
    body: { name },
  });
}

export async function deleteGroup(id: string): Promise<void> {
  await apiRequest<{ ok: true }>("/api/groups/" + encodeURIComponent(id), {
    method: "DELETE",
  });
}

export async function changeGroupMembers(id: string, hashes: string[], action: "add" | "remove"): Promise<void> {
  await apiRequest<{ ok: true }>("/api/groups/" + encodeURIComponent(id) + "/members", {
    method: "POST",
    body: { hashes, action },
  });
}

export async function fetchGroups(): Promise<GroupsResponse["groups"]> {
  const body = await apiRequest<GroupsResponse>("/api/groups");
  return body.groups;
}

export async function fetchClientSkillStates(clientId: string): Promise<ClientSkillStatesResponse> {
  return apiRequest<ClientSkillStatesResponse>(
    "/api/clients/" + encodeURIComponent(clientId) + "/skill-states",
  );
}

export async function fetchClients(): Promise<ClientsResponse["clients"]> {
  const body = await apiRequest<ClientsResponse>("/api/clients");
  return body.clients;
}

export async function fetchBackups(): Promise<BackupsListResponse> {
  return apiRequest<BackupsListResponse>("/api/backups");
}

export async function previewReset(snapshotId?: string): Promise<BackupsPreviewResponse> {
  return apiRequest<BackupsPreviewResponse>("/api/backups/preview", {
    method: "POST",
    body: snapshotId === undefined ? {} : { snapshotId },
  });
}

export async function startReset(snapshotId: string, confirm: string): Promise<ResetResponse> {
  return apiRequest<ResetResponse>("/api/reset", {
    method: "POST",
    body: { snapshotId, confirm },
  });
}

export async function fetchDoctor(): Promise<DoctorResponse> {
  return apiRequest<DoctorResponse>("/api/doctor");
}

export async function fetchStats(): Promise<StatsResponse> {
  return apiRequest<StatsResponse>("/api/stats");
}

async function loadSkillTree(hash: string, signal: AbortSignal): Promise<SkillFileEntry[]> {
  const body = await apiRequest<SkillTreeResponse>(
    "/api/skills/" + encodeURIComponent(hash) + "/tree",
    { signal },
  );
  return body.entries;
}

export async function fetchSkillTree(hash: string, signal?: AbortSignal): Promise<SkillFileEntry[]> {
  return loadResource(treeResourceKey(hash), (s) => loadSkillTree(hash, s), signal);
}

/** 读取文件内容;二进制/大文件/穿越等降级由服务端信封说明。 */
async function loadSkillFile(hash: string, relPath: string, signal: AbortSignal): Promise<SkillFileResponse> {
  return apiRequest<SkillFileResponse>(
    "/api/skills/" + encodeURIComponent(hash) + "/file?path=" + encodeURIComponent(relPath),
    { signal },
  );
}

export async function fetchSkillFile(hash: string, relPath: string, signal?: AbortSignal): Promise<SkillFileResponse> {
  return loadResource(fileResourceKey(hash, relPath), (s) => loadSkillFile(hash, relPath, s), signal);
}

/** 写操作只给动作注册表用;UI 按 id 取 execute,不要直接调这些函数。 */

/** 编辑写回:PUT { content };成功返回新哈希(记录已更新,不静默失真)。 */
export async function saveSkillFile(hash: string, relPath: string, content: string): Promise<string> {
  const body = await apiRequest<{ ok: true; hash?: unknown }>(
    "/api/skills/" + encodeURIComponent(hash) + "/file?path=" + encodeURIComponent(relPath),
    { method: "PUT", body: { content } },
  );
  if (typeof body.hash !== "string") throw new Error("服务端未返回新哈希");
  return body.hash;
}

/** 分享 skill 到授信 GitHub 仓库;失败附带结构化 error.code。 */
export async function shareSkill(target: string): Promise<ShareResponse> {
  return apiRequest<ShareResponse>("/api/share", {
    method: "POST",
    body: { target },
    fallbackCode: "github-push-failed",
  });
}

export async function analyzeSkill(target: string): Promise<AnalyzeResponse> {
  return apiRequest<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: { target },
    fallbackCode: "analyze-failed",
  });
}

/** 译文留存目标(#208):服务端按 target 解析记录哈希落盘,绝不写库存原件。 */
export interface TranslateSaveTarget {
  target: string;
  path: string;
}

/** 流式翻译:本地服务代发,密钥绝不出现在前端。onDelta 渐进回调累积全文;error 事件抛可读 Error。 */
export async function translateText(
  text: string,
  onDelta?: (full: string) => void,
  signal?: AbortSignal,
  save?: TranslateSaveTarget,
): Promise<string> {
  const body: { text: string; target?: string; path?: string } = { text };
  if (save !== undefined) {
    body.target = save.target;
    body.path = save.path;
  }
  let full = "";
  let failed: string | null = null;
  await postSse(
    "/api/translate",
    body,
    {
      delta: (d) => {
        const parsed = parseSseJson<{ text?: unknown }>(d);
        if (parsed !== null && typeof parsed.text === "string") {
          full += parsed.text;
          onDelta?.(full);
        }
      },
      error: (d) => {
        const parsed = parseSseJson<{ message?: unknown }>(d);
        failed =
          parsed !== null && typeof parsed.message === "string" && parsed.message !== ""
            ? parsed.message
            : d.trim() !== ""
              ? d
              : "翻译失败";
      },
    },
    signal,
  );
  if (failed !== null) throw new Error(failed);
  return full;
}

/** 读译文缓存(#208):命中返回全文,未命中/降级一律返回 null(调用方回退到重新翻译)。 */
export async function fetchSkillTranslation(
  hash: string,
  relPath: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const init: RequestInit = signal !== undefined ? { signal } : {};
  const res = await fetch(
    "/api/skills/" + encodeURIComponent(hash) + "/translation?path=" + encodeURIComponent(relPath),
    init,
  ).catch(() => null);
  if (res === null || res.status === 404 || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { ok: boolean; translated?: string } | null;
  if (body === null || !body.ok || typeof body.translated !== "string") return null;
  return body.translated;
}

export async function fetchArchive(): Promise<ArchiveResponse["archived"]> {
  const body = await apiRequest<ArchiveResponse>("/api/archive");
  return body.archived;
}

export async function restoreSkill(name: string): Promise<{ dirName: string; hash: string }> {
  const body = await apiRequest<{ ok: true; dirName?: unknown; hash?: unknown }>(
    "/api/skills/" + encodeURIComponent(name) + "/restore",
    { method: "POST" },
  );
  if (typeof body.dirName !== "string" || typeof body.hash !== "string") {
    throw new Error("恢复响应缺少必要字段");
  }
  return { dirName: body.dirName, hash: body.hash };
}

export async function archiveSkill(hash: string): Promise<void> {
  await apiRequest<{ ok: true }>("/api/skills/" + encodeURIComponent(hash) + "/archive", {
    method: "POST",
  });
}

export interface CreateResponse {
  ok: true;
  command: "new";
  verb: string;
  dirName: string;
  hash?: string;
  storeDir?: string;
}

export async function createSkill(dirName: string, description: string): Promise<CreateResponse> {
  return apiRequest<CreateResponse>("/api/drafts", {
    method: "POST",
    body: { dirName, description },
  });
}

export async function adoptSource(source: string): Promise<AdoptResponse> {
  return apiRequest<AdoptResponse>("/api/adopt", {
    method: "POST",
    body: { source },
  });
}

export async function previewLinks(params: LinksBatchParams): Promise<LinksPreviewResponse> {
  return apiRequest<LinksPreviewResponse>("/api/links/preview", {
    method: "POST",
    body: params,
  });
}

export async function applyLinks(params: LinksBatchParams): Promise<LinksApplyResponse> {
  return apiRequest<LinksApplyResponse>("/api/links/apply", {
    method: "POST",
    body: params,
  });
}

/**
 * 预览后只提交无冲突的 hash。多客户端时按落点各打一次 apply,
 * 避免笛卡尔积把「这边可挂、那边占用」整单打回。
 */
export async function applyCleanLinkBatch(params: LinksBatchParams): Promise<{
  created: string[];
  removed: string[];
  skipped: number;
}> {
  const preview = await previewLinks(params);
  if (params.clientIds.length === 1) {
    const { hashes, skipped } = hashesForApply(preview, params.action);
    if (hashes.length === 0) return { created: [], removed: [], skipped };
    const result = await applyLinks({ ...params, hashes });
    return { created: result.created, removed: result.removed, skipped };
  }
  const byClient = hashesByClient(preview, params.action);
  const created: string[] = [];
  const removed: string[] = [];
  for (const clientId of params.clientIds) {
    const hashes = byClient.get(clientId);
    if (hashes === undefined || hashes.length === 0) continue;
    const result = await applyLinks({ hashes, clientIds: [clientId], action: params.action });
    created.push(...result.created);
    removed.push(...result.removed);
  }
  return { created, removed, skipped: preview.conflictCount };
}

/** 开关背后就是 enable/disable(语义与 CLI 完全一致:只挂/摘链接,库存原件不动)。 */
export async function setSkillEnabled(hash: string, clientId: string, enable: boolean): Promise<void> {
  await apiRequest<{ ok: true }>(
    "/api/skills/" + encodeURIComponent(hash) + "/" + (enable ? "enable" : "disable"),
    {
      method: "POST",
      body: { clientId },
      fallbackCode: "io-error",
    },
  );
}
