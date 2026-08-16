import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  KNOWN_CLIENTS,
  hashSkillFolder,
  readSkillMeta,
  resolveSkillsDir,
  type SkillMeta,
} from "@skills-hub/core";

/** 一次本地扫描发现的 skill(尚未入库,仅供查看;入库是 M1 的 add 流程)。 */
export interface DiscoveredSkill {
  clientId: string;
  folderPath: string;
  hash: string;
  meta: SkillMeta;
}

/** 扫描各已知客户端的全局 skills 目录,返回达到收录最低要求的 skill。 */
export async function scanKnownClients(): Promise<DiscoveredSkill[]> {
  const discovered: DiscoveredSkill[] = [];
  for (const client of KNOWN_CLIENTS) {
    const dir = resolveSkillsDir(client, "global");
    if (!(await isDirectory(dir))) continue;

    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const folderPath = path.join(dir, entry.name);
      const meta = await readSkillMeta(folderPath);
      if (meta === null) continue; // 缺 name/description,未达收录最低要求

      discovered.push({
        clientId: client.id,
        folderPath,
        hash: await hashSkillFolder(folderPath),
        meta,
      });
    }
  }
  return discovered;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
