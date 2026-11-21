import { lstat, mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adoptSkillFolder,
  copyTreeJunctionSafe,
  discoverClientRoots,
  hashSkillFolder,
  installSkillRevision,
  normalizeHubPaths,
  parseSkillMeta,
  readConflicts,
  readLinksLedger,
  readStoreIndexFile,
  unlinkNoFollow,
  withConflictWriteLock,
  writeFileAtomicSafe,
  type HubPaths,
} from "@skills-hub/core";
import { performLinkChange } from "./link-actions.js";
import { autoVersionSkillAssets } from "./git-ops.js";
import { scrub } from "./llm/errors.js";

const NAME = "skills-hub";
const OWNED_ORIGIN = { kind: "authored", reference: "bootstrap" } as const;
const VERSION = /^<!-- skills-hub-guide-version: (\d+) -->$/m;

async function bundledGuide(override?: string) {
  const base = path.dirname(fileURLToPath(import.meta.url));
  const candidates = override
    ? [override]
    : [process.env.SKILLSHUB_SELF_SKILL_DIR, path.resolve(base, "../self-skill"), path.resolve(base, "self-skill")];
  for (const directory of candidates) {
    if (!directory) continue;
    const filename = path.join(directory, "SKILL.md");
    const info = await stat(filename).catch(() => null);
    if (!info?.isFile()) continue;
    const content = await readFile(filename, "utf8");
    if (parseSkillMeta(content)?.name === NAME) return { directory, content };
  }
  return null;
}

export interface GuideInstallReport {
  error?: string;
  clients: { skillsDir: string; ok: boolean; message: string }[];
}

/** Link only explicitly approved, currently discovered client locations. */
export async function installInitialGuide(home: string, paths: HubPaths, targets?: readonly string[], override?: string): Promise<GuideInstallReport> {
  const clients: GuideInstallReport["clients"] = [];
  try {
    const bundle = await bundledGuide(override);
    if (!bundle) throw new Error("无法读取随包的 skills-hub 指南");
    await withConflictWriteLock(paths, async () => {
      const index = await readStoreIndexFile(paths);
      const existing = index.skills.find(s => s.dirName === NAME);
      if (existing) {
        if (!existing.origins.some(o => o.kind === OWNED_ORIGIN.kind && o.reference === OWNED_ORIGIN.reference) ||
            (await readConflicts(paths)).some(c => c.skillName === NAME)) throw new Error("真源已有同名指南，请检查现有内容");
        const active = path.join(paths.skillsRoot, NAME);
        if (!(await lstat(active)).isDirectory() || !(await lstat(path.join(active, "SKILL.md"))).isFile()) {
          throw new Error("指南目录已变化，请检查真源");
        }
      } else {
        const adopted = await adoptSkillFolder(paths, bundle.directory, OWNED_ORIGIN);
        if (adopted.kind !== "adopted") throw new Error("随包指南与现有库存冲突");
        await autoVersionSkillAssets(home, paths, "docs(skills): install bundled Skills Hub guide");
      }
      const roots = await discoverClientRoots(home, { storeRoot: paths });
      const allowed = new Map(roots.map(root => [root.skillsDir, root]));
      for (const dir of new Set(targets ?? allowed.keys())) {
        const root = allowed.get(dir);
        try {
          if (!root) throw new Error("客户端目录已变化，请重新检查");
          const dest = path.join(dir, NAME);
          const occupied = await lstat(dest).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return null;
            throw error;
          });
          if (occupied && !occupied.isSymbolicLink()) throw new Error("已有同名文件或目录，已保留");
          const result = await performLinkChange({ storeRoot: paths, clientId: root.clientId, scope: "global",
            skillsDir: dir, dirNames: [NAME] }, "enable");
          if (!result.ok) throw new Error(result.message);
          clients.push({ skillsDir: dir, ok: true, message: "已启用" });
        } catch (error) {
          clients.push({ skillsDir: dir, ok: false, message: scrub(error instanceof Error ? error.message : String(error)) });
        }
      }
    });
    return { clients };
  } catch (error) {
    return { clients, error: scrub(error instanceof Error ? error.message : String(error)) };
  }
}

export async function adoptAndEnableSelfSkill(home: string, root: string | HubPaths, override?: string): Promise<void> {
  const report = await installInitialGuide(home, normalizeHubPaths(root), undefined, override);
  if (report.error) console.warn(report.error);
  for (const client of report.clients) if (!client.ok) console.warn(client.message);
}

type GuideStatus = "absent" | "unmanaged" | "current" | "updated";

function guideVersion(content: string): number {
  return Number(VERSION.exec(content.replace(/\r\n/g, "\n"))?.[1] ?? "0");
}

async function updateGuide(paths: HubPaths, content: string): Promise<GuideStatus> {
  const { skills } = await readStoreIndexFile(paths);
  const record = skills.find((skill) => skill.dirName === NAME);
  if (!record) return "absent";
  if (!record.origins.some((origin) => origin.kind === OWNED_ORIGIN.kind && origin.reference === OWNED_ORIGIN.reference)) {
    return "unmanaged";
  }
  if ((await readConflicts(paths)).some((conflict) => conflict.skillName === NAME)) return "unmanaged";
  const active = path.join(paths.skillsRoot, NAME);
  const filename = path.join(active, "SKILL.md");
  if (!(await lstat(active)).isDirectory() || !(await lstat(filename)).isFile()) return "unmanaged";
  const existing = await readFile(filename, "utf8");
  if (existing === content || guideVersion(existing) >= guideVersion(content)) return "current";

  const tmp = path.join(paths.stateRoot, "tmp");
  await mkdir(tmp, { recursive: true });
  const scratch = await mkdtemp(path.join(tmp, "self-guide-"));
  try {
    const candidate = path.join(scratch, NAME);
    await copyTreeJunctionSafe(active, candidate);
    await writeFileAtomicSafe(path.join(candidate, "SKILL.md"), content);
    await installSkillRevision(paths, {
      dirName: NAME,
      sourcePath: candidate,
      hash: await hashSkillFolder(candidate),
      origins: [OWNED_ORIGIN],
    });
    return "updated";
  } finally {
    await unlinkNoFollow(scratch);
  }
}

/** Audit missing links and refresh an older bundled guide while preserving client opt-outs. */
export async function syncSelfSkill(home: string, paths: HubPaths, override?: string) {
  const bundle = await bundledGuide(override);
  if (bundle === null) return { status: "absent" as const, availableClients: [] };
  const status = await withConflictWriteLock(paths, () => updateGuide(paths, bundle.content));
  if (status === "absent" || status === "unmanaged") return { status, availableClients: [] };
  const [roots, links] = await Promise.all([
    discoverClientRoots(home, { storeRoot: paths }),
    readLinksLedger(paths),
  ]);
  const linked = new Set(links.filter((entry) => (entry.skillDirName ?? entry.entryName) === NAME).map((entry) => entry.clientId));
  return { status, availableClients: [...new Set(roots.map((root) => root.clientId).filter((id) => !linked.has(id)))].sort() };
}

export async function checkBundledSelfSkill(home: string, paths: HubPaths, override?: string): Promise<void> {
  try {
    const result = await syncSelfSkill(home, paths, override);
    if (result.status === "updated") {
      console.log("已更新随包分发的 Skills Hub 指南，旧版已归档。");
      await autoVersionSkillAssets(home, paths, "docs(skills): upgrade bundled Skills Hub guide");
    }
    if (result.availableClients.length > 0) {
      console.log("自身指南可手动启用的客户端 · " + result.availableClients.join(", ") + " · skills-hub enable skills-hub --client <id>");
    }
  } catch (error) {
    console.warn("自身指南同步未完成 · " + scrub(error instanceof Error ? error.message : String(error)));
  }
}
