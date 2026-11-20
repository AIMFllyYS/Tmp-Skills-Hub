import { lstat, mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isIgnoredSkillEntry, isPortableSkillName, unlinkNoFollow, writeFileAtomicSafe, type HubConfig, type HubPaths } from "@skills-hub/core";
import { runGit, type CommandResult, type CommandRunner } from "./git-runner.js";

const IGNORE_BEGIN = "# BEGIN Skills Hub";
const IGNORE_END = "# END Skills Hub";
const IGNORE_RULES = [
  ".env", ".env.*", "node_modules/", ".venv/", "__pycache__/", ".DS_Store",
  "Thumbs.db", "*.tmp", ".skills-hub-tmp-*",
] as const;

const missing = (error: NodeJS.ErrnoException) => {
  if (error.code === "ENOENT") return null;
  throw error;
};

function stdout(result: CommandResult): string {
  if (!result.ok) throw new Error(result.message);
  return result.stdout;
}

const zeroSeparated = (text: string) => text.split("\0").filter((value) => value !== "");

async function localGitDir(root: string, runner: CommandRunner): Promise<string | null> {
  const gitDir = path.join(root, ".git");
  const entry = await lstat(gitDir).catch(missing);
  if (entry === null) return null;
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("唯一真源需要本地独立 .git 目录。");
  const head = await runner(root, ["rev-parse", "--show-toplevel"]);
  if (!head.ok) throw new Error(head.message);
  if (path.relative(await realpath(root), await realpath(head.stdout.trim())) !== "") {
    throw new Error("Git 工作树位置与唯一真源目录不一致。");
  }
  return gitDir;
}

async function ensureGitIgnore(root: string): Promise<void> {
  const file = path.join(root, ".gitignore");
  const entry = await lstat(file).catch(missing);
  if (entry !== null && !entry.isFile()) throw new Error(".gitignore 必须是普通文件。");
  const previous = entry === null ? "" : await readFile(file, "utf8");
  const custom = previous.replace(/^# BEGIN Skills Hub\r?\n[\s\S]*?^# END Skills Hub(?:\r?\n|$)/gm, "").trimEnd();
  const block = [IGNORE_BEGIN, ...IGNORE_RULES, IGNORE_END].join("\n") + "\n";
  const next = custom === "" ? block : custom + "\n\n" + block;
  if (previous !== next) await writeFileAtomicSafe(file, next);
}

function forbiddenStagedPath(file: string): boolean {
  const parts = file.replace(/\\/g, "/").split("/");
  const segments = parts.map((part) => part.toLowerCase());
  return parts.some(isIgnoredSkillEntry) ||
    segments.some((part) => part === "" || part === "." || part === ".." || part === ".git" ||
      part === "node_modules" || part === ".venv" || part === "__pycache__" || part === ".env" ||
      part.startsWith(".env.") || part === ".ds_store" || part === "thumbs.db" ||
      part.endsWith(".tmp") || part.startsWith(".skills-hub-tmp-"));
}

async function checkedPaths(root: string, candidates: readonly string[]): Promise<void> {
  for (const file of candidates) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (path.isAbsolute(file) || path.isAbsolute(relative) || relative === ".." || relative.startsWith(".." + path.sep)) {
      throw new Error("Git 待暂存路径位于真源之外。");
    }
    if (forbiddenStagedPath(file) && await lstat(absolute).catch(missing) !== null) {
      throw new Error("Git 待暂存文件包含忽略项，请先清理 Git 台账。");
    }
    const entry = await lstat(absolute).catch(missing);
    if (entry !== null && !entry.isFile()) {
      throw new Error("Git 待暂存数据包含链接或嵌套仓库，请先处理该路径。");
    }
    let ancestor = path.dirname(file);
    while (ancestor !== ".") {
      const info = await lstat(path.join(root, ancestor)).catch(missing);
      if (info !== null && (!info.isDirectory() || info.isSymbolicLink())) {
        throw new Error("Git 待暂存文件位于链接目录内。");
      }
      const next = path.dirname(ancestor);
      if (next === ancestor) throw new Error("Git 待暂存路径非法。");
      ancestor = next;
    }
  }
}

async function ensureIdentity(root: string, runner: CommandRunner): Promise<void> {
  for (const [key, value] of [["user.name", "Skills Hub"], ["user.email", "skills-hub@local"]] as const) {
    const configured = await runner(root, ["config", "--get", key]);
    if (!configured.ok || configured.stdout.trim() === "") {
      stdout(await runner(root, ["config", "--local", key, value]));
    }
  }
}

async function disabledFilterArgs(root: string, runner: CommandRunner): Promise<string[]> {
  const result = await runner(root, ["config", "--name-only", "--get-regexp", "^filter\\."]);
  if (!result.ok && result.exitCode !== 1) throw new Error(result.message);
  const drivers = new Set([...result.stdout.matchAll(/^filter\.([A-Za-z0-9_.-]+)\.(?:clean|process|required|smudge)$/gm)].map((match) => match[1]!));
  const args: string[] = [];
  for (const driver of drivers) {
    args.push("-c", `filter.${driver}.clean=`, "-c", `filter.${driver}.process=`, "-c", `filter.${driver}.required=false`);
  }
  return args;
}

export interface GitCommitResult { skipped: boolean; commitHash?: string }

async function stageAndCommit(root: string, gitDir: string, summary: string, runner: CommandRunner): Promise<GitCommitResult> {
  if (summary.trim() === "" || summary.includes("\0")) throw new Error("提交说明为空或无效。");
  const lock = path.join(gitDir, "skills-hub-commit");
  await mkdir(lock);
  const currentIndex = path.join(gitDir, "index");
  try {
    const original = await readFile(currentIndex).catch(missing);
    const work = await mkdtemp(path.join(lock, "txn-"));
    const tempIndex = path.join(work, "index");
    if (original !== null) await writeFileAtomicSafe(tempIndex, original);
    const options = { indexFile: tempIndex };
    const pathsOnly = { ...options, machinePaths: true };
    const candidates = stdout(await runner(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], pathsOnly));
    await checkedPaths(root, [...new Set(zeroSeparated(candidates))]);
    const filters = await disabledFilterArgs(root, runner);
    stdout(await runner(root, [...filters, "add", "-A", "--", "."], options));
    const staged = stdout(await runner(root, ["ls-files", "-z", "--cached"], pathsOnly));
    await checkedPaths(root, zeroSeparated(staged));
    const diff = await runner(root, ["diff", "--cached", "--quiet", "--no-ext-diff", "--exit-code"], options);
    if (diff.ok) return { skipped: true };
    if (diff.exitCode !== 1) throw new Error(diff.message);
    const current = await readFile(currentIndex).catch(missing);
    if (Buffer.compare(original ?? Buffer.alloc(0), current ?? Buffer.alloc(0)) !== 0) {
      throw new Error("Git 台账在提交前发生变化，请重试。");
    }
    await ensureIdentity(root, runner);
    stdout(await runner(root, ["commit", "--no-gpg-sign", "-m", summary], options));
    await writeFileAtomicSafe(currentIndex, await readFile(tempIndex));
    return { skipped: false, commitHash: stdout(await runner(root, ["rev-parse", "HEAD"])).trim() };
  } finally {
    await unlinkNoFollow(lock);
  }
}

export async function initSkillsGitRepo(skillsRoot: string, runner: CommandRunner = runGit): Promise<GitCommitResult> {
  await mkdir(skillsRoot, { recursive: true });
  let gitDir = await localGitDir(skillsRoot, runner);
  if (gitDir === null) {
    stdout(await runner(skillsRoot, ["init", "-b", "main", "--template="]));
    gitDir = await localGitDir(skillsRoot, runner);
    if (gitDir === null) throw new Error("Git 初始化后缺少 .git 目录。");
  }
  await ensureGitIgnore(skillsRoot);
  const hasHead = await runner(skillsRoot, ["rev-parse", "--verify", "HEAD"]);
  return hasHead.ok ? { skipped: true } : stageAndCommit(skillsRoot, gitDir, "chore(skills): initialize single-source repository", runner);
}

export async function autoCommitSkillChange(
  paths: HubPaths,
  summary: string,
  config: Pick<HubConfig, "git">,
  runner: CommandRunner = runGit,
): Promise<GitCommitResult> {
  if (config.git?.enabled !== true) return { skipped: true };
  const root = paths.skillsRoot;
  const git = await runner(root, ["--version"]);
  if (!git.ok && git.reason === "missing") return { skipped: true };
  stdout(git);
  const gitDir = await localGitDir(root, runner);
  if (gitDir === null) throw new Error("版本控制已开启，请先初始化唯一真源 Git 仓库。");
  await ensureGitIgnore(root);
  return stageAndCommit(root, gitDir, summary, runner);
}

export interface GitStatus {
  initialized: boolean;
  branch: string | null;
  remoteUrl: string | null;
  aheadCount: number;
  dirtyCount: number;
  remoteDiverged: boolean;
}

export async function getGitStatus(root: string, runner: CommandRunner = runGit): Promise<GitStatus> {
  const defaults = { initialized: false, branch: null, remoteUrl: null, aheadCount: 0, dirtyCount: 0, remoteDiverged: false };
  if (await localGitDir(root, runner) === null) return defaults;
  const [branch, remote, status, compare] = await Promise.all([
    runner(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    runner(root, ["config", "--get", "remote.origin.url"]),
    runner(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    runner(root, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
  ]);
  const entries = zeroSeparated(stdout(status));
  let dirtyCount = 0;
  for (let i = 0; i < entries.length; i++) {
    dirtyCount++;
    if (/[RC]/.test(entries[i]!.slice(0, 2))) i++;
  }
  const [ahead = 0, behind = 0] = compare.ok ? compare.stdout.trim().split(/\s+/).map(Number) : [];
  return {
    initialized: true, branch: branch.ok ? branch.stdout.trim() : null,
    remoteUrl: remote.ok ? remote.stdout.trim() : null, aheadCount: ahead, dirtyCount, remoteDiverged: behind > 0,
  };
}

export interface GitCommitEntry { hash: string; shortHash: string; timestamp: string; author: string; message: string }

export async function getGitLog(root: string, skillName?: string, limit = 30, runner: CommandRunner = runGit): Promise<GitCommitEntry[]> {
  if (skillName !== undefined && !isPortableSkillName(skillName)) throw new Error("无效的技能目录名。");
  if (await localGitDir(root, runner) === null || !(await runner(root, ["rev-parse", "--verify", "HEAD"])).ok) return [];
  const count = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 30;
  const args = ["--literal-pathspecs", "log", "-z", "-n", String(count), "--format=%H%x00%h%x00%aI%x00%an%x00%s", "--"];
  if (skillName !== undefined) args.push(skillName);
  const fields = stdout(await runner(root, args)).split("\0");
  const rows: GitCommitEntry[] = [];
  for (let i = 0; i + 4 < fields.length; i += 5) {
    const [hash, shortHash, timestamp, author, message] = fields.slice(i, i + 5) as [string, string, string, string, string];
    if (!/^[a-f0-9]{40,64}$/.test(hash)) throw new Error("Git 提交历史格式无效。");
    rows.push({ hash, shortHash, timestamp, author, message });
  }
  return rows;
}

export async function getGitDiff(root: string, refA = "HEAD", refB?: string, runner: CommandRunner = runGit): Promise<string> {
  if (await localGitDir(root, runner) === null) return "";
  const resolve = async (ref: string) => {
    const value = stdout(await runner(root, ["rev-parse", "--verify", "--end-of-options", ref + "^{commit}"])).trim();
    if (!/^[a-f0-9]{40,64}$/.test(value)) throw new Error("无法解析 Git 版本。");
    return value;
  };
  const refs = [await resolve(refA)];
  if (refB !== undefined) refs.push(await resolve(refB));
  return stdout(await runner(root, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", ...refs, "--"]));
}

export async function getGitCommitPatch(root: string, commit: string, skillName: string | undefined, runner: CommandRunner = runGit): Promise<string> {
  if (!/^[a-f0-9]{7,64}$/i.test(commit)) throw new Error("提交哈希无效。");
  if (skillName !== undefined && !isPortableSkillName(skillName)) throw new Error("无效的技能目录名。");
  if (await localGitDir(root, runner) === null) return "";
  const resolved = stdout(await runner(root, ["rev-parse", "--verify", "--end-of-options", commit + "^{commit}"])).trim();
  if (!/^[a-f0-9]{40,64}$/.test(resolved)) throw new Error("无法解析 Git 版本。");
  const args = ["-c", "core.quotepath=false", "--literal-pathspecs", "show", "--format=", "--no-color",
    "--no-ext-diff", "--no-textconv", "--no-renames", resolved, "--"];
  if (skillName !== undefined) args.push(skillName);
  return stdout(await runner(root, args));
}
