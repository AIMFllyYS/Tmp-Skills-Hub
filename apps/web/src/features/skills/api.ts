import type { GroupsResponse, SkillRecord, SkillsResponse } from "./types.js";

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
