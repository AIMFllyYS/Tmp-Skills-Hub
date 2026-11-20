import path from "node:path";
import { normalizeHubPaths, type HubPaths } from "@skills-hub/core";
import {
  autoCommitSkillChange, detectGitEnvironment, getGitCommitPatch, getGitDiff, getGitLog, getGitStatus, githubRepoUrl,
  initSkillsGitRepo, pushCloudBackup, redactGitSecrets, runGit, setupCloudBackupRepo,
  type CloudBackupOptions, type GhDeviceLogin, type GitCloudRunners, type GitCommitResult,
} from "./git/index.js";
import { readStorePreferences, serializePreferenceWrite, writeStorePreferences } from "./store-preferences.js";

export interface GitRuntime extends GitCloudRunners {
  deviceLogin?: GhDeviceLogin;
}

export class GitOperationError extends Error {
  constructor(readonly code: "git-unavailable" | "bad-usage" | "io-error", message: string) {
    super(message);
  }
}

const commitQueue = new Map<string, Promise<void>>();

async function runCommit<T>(paths: HubPaths, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(paths.skillsRoot);
  const result = (commitQueue.get(key) ?? Promise.resolve()).then(task);
  const completion = result.then(() => undefined, () => undefined);
  commitQueue.set(key, completion);
  void completion.then(() => { if (commitQueue.get(key) === completion) commitQueue.delete(key); });
  return result;
}

export async function ensureGitRepository(paths: HubPaths, runtime: GitRuntime = {}): Promise<GitCommitResult> {
  const runner = runtime.git ?? runGit;
  if (!(await runner(paths.skillsRoot, ["--version"])).ok) throw new GitOperationError("git-unavailable", "请先安装 Git。");
  return runCommit(paths, () => initSkillsGitRepo(paths.skillsRoot, runner));
}

export async function performGitToggle(home: string, paths: HubPaths, enabled: boolean, runtime: GitRuntime = {}) {
  return serializePreferenceWrite(home, async () => {
    const current = await readStorePreferences(home);
    if (enabled) await ensureGitRepository(paths, runtime);
    await writeStorePreferences(home, paths, { ...current, git: { ...current.git, enabled } });
    return { enabled };
  });
}

export async function performGitStatus(home: string, paths: HubPaths | null, runtime: GitRuntime = {}) {
  const environment = await detectGitEnvironment(paths?.skillsRoot ?? home, runtime);
  const { git } = paths === null ? { git: { enabled: false } } : await readStorePreferences(home);
  const repo = environment.gitInstalled && paths !== null ? await getGitStatus(paths.skillsRoot, runtime.git) : null;
  const remoteUrl = repo?.remoteUrl ? githubRepoUrl(repo.remoteUrl) : null;
  return { ...environment, ...repo, remoteUrl, enabled: git.enabled };
}

async function versioning(home: string, paths: HubPaths, runtime: GitRuntime) {
  const { git } = await readStorePreferences(home);
  if (!git.enabled) throw new GitOperationError("bad-usage", "Git 版本控制尚未开启。");
  const runner = runtime.git ?? runGit;
  if (!(await runner(paths.skillsRoot, ["--version"])).ok) throw new GitOperationError("git-unavailable", "请先安装 Git。");
  return { git, runner };
}

export async function performGitLog(home: string, paths: HubPaths, skill: string | undefined, limit: number, runtime: GitRuntime = {}) {
  const { runner } = await versioning(home, paths, runtime);
  return getGitLog(paths.skillsRoot, skill, limit, runner);
}

export async function performGitDiff(home: string, paths: HubPaths, refs: {
  refA?: string | undefined; refB?: string | undefined; commit?: string | undefined; skill?: string | undefined;
}, runtime: GitRuntime = {}) {
  const { runner } = await versioning(home, paths, runtime);
  return refs.commit === undefined
    ? getGitDiff(paths.skillsRoot, refs.refA, refs.refB, runner)
    : getGitCommitPatch(paths.skillsRoot, refs.commit, refs.skill, runner);
}

export async function performGitCommit(home: string, paths: HubPaths, summary: string, runtime: GitRuntime = {}): Promise<GitCommitResult> {
  const message = summary.trim();
  if (message === "" || message.length > 500 || /[\r\n\0]/.test(message)) {
    throw new GitOperationError("bad-usage", "提交说明需要 1 到 500 字符的单行文本。");
  }
  return runCommit(paths, async () => {
    const { git, runner } = await versioning(home, paths, runtime);
    return autoCommitSkillChange(paths, redactGitSecrets(message), { git }, runner);
  });
}

/** A failed Git side effect must never change the outcome of the inventory transaction. */
export async function autoVersionSkillAssets(home: string | undefined, root: HubPaths | string, summary: string): Promise<void> {
  if (home === undefined) return;
  const paths = normalizeHubPaths(root);
  try {
    await runCommit(paths, async () => {
      const { git } = await readStorePreferences(home);
      if (git.enabled) await autoCommitSkillChange(paths, redactGitSecrets(summary), { git });
    });
  } catch (error) {
    console.warn(JSON.stringify({
      code: "git-auto-commit-failed",
      message: redactGitSecrets(error instanceof Error ? error.message : String(error)),
    }));
  }
}

export async function performCloudSetup(home: string, paths: HubPaths, input: CloudBackupOptions, runtime: GitRuntime = {}) {
  await versioning(home, paths, runtime);
  return setupCloudBackupRepo(paths.skillsRoot, input, runtime);
}

export async function performCloudPush(home: string, paths: HubPaths, runtime: GitRuntime = {}) {
  await versioning(home, paths, runtime);
  return pushCloudBackup(paths.skillsRoot, runtime);
}
