import { fileResourceKey, loadResource, treeResourceKey } from "./async-resource.js";
import type { AdoptResponse, AnalyzeResponse, ArchiveResponse, BackupsListResponse, BackupsPreviewResponse, ClientLinkRow, ClientSkillStatesResponse, ClientsResponse, DoctorResponse, GroupsResponse, LinksApplyResponse, LinksBatchParams, LinksPreviewResponse, ResetResponse, ShareResponse, SkillFileEntry, SkillFileResponse, SkillLinksResponse, SkillRecord, SkillsResponse, SkillTreeResponse, StatsResponse, VerifyResponse } from "./types.js";

/** 拉取库存列表;HTTP 失败抛错(调用方转为离线态)。 */
export async function fetchCatalog(): Promise<{ storeRoot: string; skills: SkillRecord[] }> {
  const res = await fetch("/api/skills");
  if (!res.ok) throw new Error("GET /api/skills → " + res.status);
  const body = (await res.json()) as SkillsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return { storeRoot: body.storeRoot, skills: body.skills };
}

export async function fetchSkills(): Promise<SkillRecord[]> {
  return (await fetchCatalog()).skills;
}

export async function createGroup(id: string, name: string, description = ""): Promise<void> {
  const res = await fetch("/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, name, description }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const res = await fetch("/api/groups/" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function deleteGroup(id: string): Promise<void> {
  const res = await fetch("/api/groups/" + encodeURIComponent(id), { method: "DELETE" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function changeGroupMembers(id: string, hashes: string[], action: "add" | "remove"): Promise<void> {
  const res = await fetch("/api/groups/" + encodeURIComponent(id) + "/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hashes, action }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function fetchGroups(): Promise<GroupsResponse["groups"]> {
  const res = await fetch("/api/groups");
  if (!res.ok) throw new Error("GET /api/groups → " + res.status);
  const body = (await res.json()) as GroupsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.groups;
}

export async function fetchSkillLinks(hash: string): Promise<ClientLinkRow[]> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/links");
  if (!res.ok) throw new Error("GET skill-links → " + res.status);
  const body = (await res.json()) as SkillLinksResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.links;
}

export async function fetchClientSkillStates(clientId: string): Promise<ClientSkillStatesResponse> {
  const res = await fetch("/api/clients/" + encodeURIComponent(clientId) + "/skill-states");
  if (!res.ok) throw new Error("GET client-skill-states → " + res.status);
  const body = (await res.json()) as ClientSkillStatesResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body;
}

export async function fetchClients(): Promise<ClientsResponse["clients"]> {
  const res = await fetch("/api/clients");
  if (!res.ok) throw new Error("GET /api/clients → " + res.status);
  const body = (await res.json()) as ClientsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.clients;
}

export async function fetchVerify(): Promise<VerifyResponse> {
  const res = await fetch("/api/verify");
  const body = (await res.json().catch(() => null)) as VerifyResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function fetchBackups(): Promise<BackupsListResponse> {
  const res = await fetch("/api/backups");
  const body = (await res.json().catch(() => null)) as BackupsListResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function previewReset(snapshotId?: string): Promise<BackupsPreviewResponse> {
  const res = await fetch("/api/backups/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshotId === undefined ? {} : { snapshotId }),
  });
  const body = (await res.json().catch(() => null)) as BackupsPreviewResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function startReset(snapshotId: string, confirm: string): Promise<ResetResponse> {
  const res = await fetch("/api/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshotId, confirm }),
  });
  const body = (await res.json().catch(() => null)) as ResetResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function fetchDoctor(): Promise<DoctorResponse> {
  const res = await fetch("/api/doctor");
  const body = (await res.json().catch(() => null)) as DoctorResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error("GET /api/stats → " + res.status);
  const body = (await res.json()) as StatsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body;
}

async function loadSkillTree(hash: string, signal: AbortSignal): Promise<SkillFileEntry[]> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/tree", { signal });
  if (!res.ok) throw new Error("GET skill-tree → " + res.status);
  const body = (await res.json()) as SkillTreeResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.entries;
}

export async function fetchSkillTree(hash: string, signal?: AbortSignal): Promise<SkillFileEntry[]> {
  return loadResource(treeResourceKey(hash), (s) => loadSkillTree(hash, s), signal);
}

/** 读取文件内容;二进制/大文件/穿越等降级由服务端信封说明。 */
async function loadSkillFile(hash: string, relPath: string, signal: AbortSignal): Promise<SkillFileResponse> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/file?path=" + encodeURIComponent(relPath), { signal });
  const body = (await res.json().catch(() => null)) as SkillFileResponse | { ok: false; code: string; message: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const msg = body !== null && "message" in body ? body.message : "HTTP " + res.status;
    throw new Error(msg);
  }
  return body;
}

export async function fetchSkillFile(hash: string, relPath: string, signal?: AbortSignal): Promise<SkillFileResponse> {
  return loadResource(fileResourceKey(hash, relPath), (s) => loadSkillFile(hash, relPath, s), signal);
}

/** 写操作只给动作注册表用;UI 按 id 取 execute,不要直接调这些函数。 */

/** 编辑写回:PUT { content };成功返回新哈希(记录已更新,不静默失真)。 */
export async function saveSkillFile(hash: string, relPath: string, content: string): Promise<string> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/file?path=" + encodeURIComponent(relPath), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; hash?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok || typeof body.hash !== "string") {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
  return body.hash;
}

/** 翻译代理:本地服务代发,密钥绝不出现在前端。失败抛可读 Error(原文不受影响)。 */
export async function shareSkill(target: string): Promise<ShareResponse> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const body = (await res.json().catch(() => null)) as ShareResponse | { ok: false; code?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const err = new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
    (err as { code?: string }).code = body !== null && "code" in body ? body.code : "github-push-failed";
    throw err;
  }
  return body;
}

export async function analyzeSkill(target: string): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const body = (await res.json().catch(() => null)) as AnalyzeResponse | { ok: false; code?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const err = new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
    (err as { code?: string }).code = body !== null && "code" in body ? body.code : "analyze-failed";
    throw err;
  }
  return body;
}

export async function translateText(text: string): Promise<string> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; text?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok || typeof body.text !== "string") {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
  return body.text;
}

export async function fetchArchive(): Promise<ArchiveResponse["archived"]> {
  const res = await fetch("/api/archive");
  if (!res.ok) throw new Error("GET /api/archive → " + res.status);
  const body = (await res.json()) as ArchiveResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.archived;
}

/** 开关背后就是 enable/disable(语义与 CLI 完全一致:只挂/摘链接,库存原件不动)。 */
export async function restoreSkill(name: string): Promise<{ dirName: string; hash: string }> {
  const res = await fetch("/api/skills/" + encodeURIComponent(name) + "/restore", { method: "POST" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; dirName?: string; hash?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok || typeof body.dirName !== "string" || typeof body.hash !== "string") {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
  return { dirName: body.dirName, hash: body.hash };
}

export async function archiveSkill(hash: string): Promise<void> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/archive", { method: "POST" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
}

export async function adoptSource(source: string): Promise<AdoptResponse> {
  const res = await fetch("/api/adopt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const body = (await res.json().catch(() => null)) as AdoptResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function previewLinks(params: LinksBatchParams): Promise<LinksPreviewResponse> {
  const res = await fetch("/api/links/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => null)) as LinksPreviewResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function applyLinks(params: LinksBatchParams): Promise<LinksApplyResponse> {
  const res = await fetch("/api/links/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => null)) as LinksApplyResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function setSkillEnabled(hash: string, clientId: string, enable: boolean): Promise<void> {
  const res = await fetch("/api/skills/" + hash + "/" + (enable ? "enable" : "disable"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string; code?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const msg = body !== null && body.message !== undefined ? body.message : "HTTP " + res.status;
    const err = new Error(msg);
    (err as { code?: string }).code = body?.code ?? "io-error";
    throw err;
  }
}
