import { fileResourceKey, loadResource, treeResourceKey } from "./async-resource.js";
import type { ArchiveResponse, ClientsResponse, GroupsResponse, SkillFileEntry, SkillFileResponse, SkillRecord, SkillsResponse, SkillTreeResponse, StatsResponse } from "./types.js";

/** 拉取库存列表;HTTP 失败抛错(调用方转为离线态)。 */
export async function fetchSkills(): Promise<SkillRecord[]> {
  const res = await fetch("/api/skills");
  if (!res.ok) throw new Error("GET /api/skills → " + res.status);
  const body = (await res.json()) as SkillsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.skills;
}

export async function fetchGroups(): Promise<GroupsResponse["groups"]> {
  const res = await fetch("/api/groups");
  if (!res.ok) throw new Error("GET /api/groups → " + res.status);
  const body = (await res.json()) as GroupsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.groups;
}

export async function fetchClients(): Promise<ClientsResponse["clients"]> {
  const res = await fetch("/api/clients");
  if (!res.ok) throw new Error("GET /api/clients → " + res.status);
  const body = (await res.json()) as ClientsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.clients;
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
export async function archiveSkill(hash: string): Promise<void> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/archive", { method: "POST" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
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
