import path from "node:path";
import {
  applyLinkSet,
  readLinksLedger,
  readStoreIndex,
  recordUsage,
  writeStoreIndex,
  type LinkEntry,
} from "@skills-hub/core";

/**
 * enable/disable 的共享执行层:CLI 命令(store-cmds)与本地服务(ui-server)共用同一套
 * 台账计算 + 原子集合切换 + visibleIn 同步 + 调用计数,行为不漂移。
 * 错误通过结构化返回值表达(不发散到 CLI 的 stderr / HTTP 状态码)。
 */

export interface LinkChangeRequest {
  storeRoot: string;
  clientId: string;
  /** global(默认,home 下)/ project(cwd 下) */
  scope: "global" | "project";
  skillsDir: string;
  dirNames: string[];
}

export type LinkChangeResult =
  | { ok: true; created: string[]; removed: string[] }
  | { ok: false; code: "link-failed"; message: string };

/** 同步 index.json 的 visibleIn(由台账推导:某 dirName 在哪些客户端有链接)。 */
export async function syncVisibleIn(storeRoot: string, ledger: LinkEntry[]): Promise<void> {
  const skills = await readStoreIndex(storeRoot);
  let changed = false;
  for (const s of skills) {
    const visible = [...new Set(ledger.filter((e) => e.entryName === s.dirName).map((e) => e.clientId))].sort();
    const same = visible.length === s.visibleIn.length && visible.every((v, i) => v === s.visibleIn[i]);
    if (!same) {
      s.visibleIn = visible;
      changed = true;
    }
  }
  if (changed) await writeStoreIndex(storeRoot, skills);
}

/**
 * 执行一次链接集合切换:enable = 集合切换为「保留未点名 + 新增点名」;
 * disable = 集合切换为「排除点名」。成功后同步 visibleIn 并(enable 时)计数。
 * 返回结构化结果;unregistered-conflict / not-link-conflict 由调用方决定如何呈现。
 */
export async function performLinkChange(
  req: LinkChangeRequest,
  action: "enable" | "disable",
): Promise<LinkChangeResult> {
  const { storeRoot, clientId, scope, skillsDir, dirNames } = req;
  const skills = await readStoreIndex(storeRoot);
  const ledger = await readLinksLedger(storeRoot);
  const existing = ledger.filter((e) => e.targetDir === skillsDir);
  const kind = process.platform === "win32" ? "junction" : "symlink";
  const now = new Date().toISOString();

  let desired: LinkEntry[];
  if (action === "enable") {
    const planNames = new Set(dirNames);
    const keep = existing.filter((e) => !planNames.has(e.entryName));
    desired = [
      ...keep,
      ...dirNames.map((name) => {
        const record = skills.find((s) => s.dirName === name)!;
        const prev = existing.find((e) => e.entryName === name);
        return {
          id: prev?.id ?? clientId + ":" + scope + ":" + name,
          clientId,
          scope,
          targetDir: skillsDir,
          entryName: name,
          skillHash: record.hash,
          kind: prev?.kind ?? kind,
          createdAt: prev?.createdAt ?? now,
        } satisfies LinkEntry;
      }),
    ];
  } else {
    const drop = new Set(dirNames);
    desired = existing.filter((e) => !drop.has(e.entryName));
  }

  const result = await applyLinkSet(storeRoot, { targetDir: skillsDir, entries: desired });
  if (!result.ok) {
    const extra =
      result.code === "unregistered-conflict"
        ? "落点被用户自己的目录占据且台账未登记 — 绝不覆盖,请人工处理。"
        : result.code === "not-link-conflict"
          ? "台账条目落点已被用户替换为非链接 — 绝不触碰,请人工处理。"
          : "";
    return { ok: false, code: "link-failed", message: result.message + (extra !== "" ? " " + extra : "") };
  }
  await syncVisibleIn(storeRoot, result.ledger);
  // #27:enable 真实生效才计数(预演模式在 applyLinkSet 前已返回,不计数)
  if (action === "enable") {
    for (const p of result.created) {
      const name = path.basename(p);
      const record = skills.find((s) => s.dirName === name);
      if (record !== undefined) await recordUsage(storeRoot, record.hash, "enable").catch(() => undefined);
    }
  }
  return { ok: true, created: result.created, removed: result.removed };
}
