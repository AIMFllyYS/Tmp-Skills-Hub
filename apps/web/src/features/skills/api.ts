import type { ClientsResponse, GroupsResponse, SkillRecord, SkillsResponse } from "./types.js";

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

/** 开关背后就是 enable/disable(语义与 CLI 完全一致:只挂/摘链接,库存原件不动)。 */
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
