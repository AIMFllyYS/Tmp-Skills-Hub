import path from "node:path";
import { archiveSkill, restoreArchivedSkill, saveSkillFile, type HubPaths } from "@skills-hub/core";
import { autoVersionSkillAssets } from "./git-ops.js";

export async function archiveManagedSkill(home: string, paths: HubPaths, name: string) {
  const result = await archiveSkill(paths, name);
  if (result.ok) await autoVersionSkillAssets(home, paths, "chore(skills): archive " + name);
  return result;
}

export async function restoreManagedSkill(home: string, paths: HubPaths, name: string) {
  const result = await restoreArchivedSkill(paths, name);
  if (result.ok) await autoVersionSkillAssets(home, paths, "chore(skills): restore " + result.dirName);
  return result;
}

export async function saveManagedSkillFile(home: string, input: Parameters<typeof saveSkillFile>[0]) {
  const result = await saveSkillFile(input);
  if (result.ok) await autoVersionSkillAssets(home, input.storeRoot, "docs(skills): edit " + path.basename(input.skillDir) + "/" + input.relPath);
  return result;
}
