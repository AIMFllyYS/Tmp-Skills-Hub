import type { ClientInfo, SkillRecord, UsageCounters, UsageRankEntry } from "../skills/types.js";

export function coverageOf(skills: SkillRecord[]): { linked: number; total: number } {
  return { linked: skills.filter((s) => s.visibleIn.length > 0).length, total: skills.length };
}

export function recentSkills(skills: SkillRecord[], limit: number): SkillRecord[] {
  return [...skills]
    .sort((a, b) => b.installedAt.localeCompare(a.installedAt) || a.dirName.localeCompare(b.dirName))
    .slice(0, limit);
}

export function usageRows(
  skills: SkillRecord[],
  ranking: UsageRankEntry[],
  counters: Map<string, UsageCounters>,
): { hash: string; name: string; total: number; show: number; enable: number }[] {
  const byHash = new Map(skills.map((s) => [s.hash, s.dirName]));
  if (ranking.length > 0) {
    return ranking.map((r) => ({
      hash: r.skillHash,
      name: byHash.get(r.skillHash) ?? r.skillHash.slice(0, 12),
      total: r.total,
      show: r.show,
      enable: r.enable,
    }));
  }
  return skills
    .map((s) => {
      const u = counters.get(s.hash) ?? { show: 0, enable: 0 };
      return { hash: s.hash, name: s.dirName, total: u.show + u.enable, show: u.show, enable: u.enable };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function appDistribution(
  skills: SkillRecord[],
  clients: ClientInfo[],
): { id: string; enabled: number; total: number }[] {
  return clients.map((c) => ({
    id: c.clientId,
    enabled: skills.filter((s) => s.visibleIn.includes(c.clientId)).length,
    total: skills.length,
  }));
}

export function sourceDistribution(skills: SkillRecord[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of skills) {
    const kinds = s.origins.length === 0 ? ["未标记"] : [...new Set(s.origins.map((o) => o.kind || "未标记"))];
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}
