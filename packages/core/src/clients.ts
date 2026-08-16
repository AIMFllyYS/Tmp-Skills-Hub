import path from "node:path";
import type { LinkScope } from "./types.js";

/**
 * 已知客户端的目录约定(通用层)。
 * 只描述「skills 目录在哪」,link/unlink 的实现在 M1 里程碑落地。
 * 各家 YAML 精致适配是后置项,登记在 docs/issues/backlog-from-first-sync.md。
 */
export interface KnownClient {
  id: string;
  /** 相对 home(全局)或项目根(项目级)的 skills 目录。 */
  relativeSkillsDir: string;
}

export const KNOWN_CLIENTS: readonly KnownClient[] = [
  { id: "claude", relativeSkillsDir: ".claude/skills" },
  { id: "codex", relativeSkillsDir: ".codex/skills" },
  { id: "cursor", relativeSkillsDir: ".cursor/skills" },
  { id: "agents", relativeSkillsDir: ".agents/skills" },
];

/**
 * 解析某客户端在指定范围下的 skills 目录绝对路径。
 *
 * home 必须由调用方显式传入:core 内部不再自行决定写入位置,
 * 沙箱重定向(--home / SKILLS_HUB_HOME)的唯一入口在 cli 层,
 * 见 docs/specs/store-and-paths-v0.md §1、§5。
 */
export function resolveSkillsDir(client: KnownClient, scope: LinkScope, home: string, projectRoot?: string): string {
  const base = scope === "global" ? home : projectRoot;
  if (base === undefined) {
    throw new Error(`project scope requires projectRoot (client: ${client.id})`);
  }
  return path.join(base, client.relativeSkillsDir);
}
