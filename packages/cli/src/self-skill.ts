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

/** Initial bootstrap is the only automatic client-link creation for the bundled guide. */
export async function adoptAndEnableSelfSkill(home: string, storeRoot: string | HubPaths, override?: string): Promise<void> {
  try {
    const bundle = await bundledGuide(override);
    if (bundle === null) return;
    const paths = normalizeHubPaths(storeRoot);
    const outcome = await adoptSkillFolder(paths, bundle.directory, OWNED_ORIGIN);
    if (outcome.kind !== "adopted") {
      await checkBundledSelfSkill(home, paths, override);
      return;
    }
    await autoVersionSkillAssets(home, paths, "docs(skills): install bundled Skills Hub guide");
    for (const root of await discoverClientRoots(home, { storeRoot: paths })) {
      try {
        const result = await performLinkChange({
          storeRoot: paths, clientId: root.clientId, scope: "global",
          skillsDir: root.skillsDir, dirNames: [outcome.record.dirName],
        }, "enable");
        if (!result.ok) console.warn("自身指南启用失败 · " + root.clientId + " · " + scrub(result.message));
      } catch (error) {
        console.warn("自身指南启用失败 · " + root.clientId + " · " + scrub(error instanceof Error ? error.message : String(error)));
      }
    }
  } catch (error) {
    console.warn("自身指南收录未完成 · " + scrub(error instanceof Error ? error.message : String(error)));
  }
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
