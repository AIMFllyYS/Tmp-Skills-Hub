import type { ClientLinkState, SkillRecord } from "../skills/types.js";

export type ClientEnableFilter = "all" | "on" | "off";

/** 客户端视角:只看已启用(受管) / 只看未启用(off)。占用与悬空只在「全部」里出现。 */
export function filterByClientEnable(
  skills: SkillRecord[],
  filter: ClientEnableFilter,
  stateOf: (hash: string) => ClientLinkState,
): SkillRecord[] {
  if (filter === "all") return skills;
  return skills.filter((s) => {
    const st = stateOf(s.hash);
    return filter === "on" ? st === "managed" : st === "off";
  });
}

export function fallbackClientState(visibleIn: readonly string[], clientId: string): ClientLinkState {
  return visibleIn.includes(clientId) ? "managed" : "off";
}
