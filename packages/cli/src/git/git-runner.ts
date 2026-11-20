import { execFile } from "node:child_process";
import os from "node:os";
import { redactGitSecrets } from "./secret-scan.js";

export type CommandResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; stdout: string; stderr: string; reason: "missing" | "timeout" | "exit"; message: string; exitCode: number | null };

interface RunOptions {
  timeoutMs?: number;
  /** Used only by the repository transaction to bind a temporary index. */
  indexFile?: string;
}

export type CommandRunner = (cwd: string, args: readonly string[], options?: RunOptions) => Promise<CommandResult>;

function run(program: "git" | "gh", cwd: string, args: readonly string[], options?: RunOptions): Promise<CommandResult> {
  const env = { ...process.env };
  // Clear caller Git redirections: the repository must be selected by cwd.
  for (const name of [
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
  ]) delete env[name];
  Object.assign(env, { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" });
  if (program === "git" && options?.indexFile) env.GIT_INDEX_FILE = options.indexFile;
  const argv = program === "git"
    ? ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + (process.platform === "win32" ? "NUL" : "/dev/null"), ...args]
    : [...args];
  return new Promise((resolve) => {
    execFile(program, argv, {
      cwd, env, shell: false, windowsHide: true, timeout: options?.timeoutMs ?? 30_000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8",
    }, (error, rawOut, rawErr) => {
      const stdout = redactGitSecrets(rawOut);
      const stderr = redactGitSecrets(rawErr);
      if (error === null) {
        resolve({ ok: true, stdout, stderr });
      } else {
        const reason = error.code === "ENOENT" ? "missing" : error.killed ? "timeout" : "exit";
        const exitCode = typeof error.code === "number" ? error.code : null;
        const message = reason === "missing" ? program + " 未安装或无法启动" :
          reason === "timeout" ? program + " 执行超时" : stderr.trim() || program + " 退出码 " + String(exitCode ?? "unknown");
        resolve({ ok: false, stdout, stderr, reason, message, exitCode });
      }
    });
  });
}

export const runGit: CommandRunner = (cwd, args, options) => run("git", cwd, args, options);
export const runGh: CommandRunner = (cwd, args, options) => run("gh", cwd, args, options);

export function parseGhUsername(output: string): string | null {
  let first: string | null = null;
  let current: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    const match = /Logged in to github\.com account ([A-Za-z0-9][A-Za-z0-9-]*)/i.exec(line);
    if (match) {
      current = match[1] ?? null;
      first ??= current;
    } else if (/Active account:\s*true/i.test(line) && current !== null) {
      return current;
    }
  }
  return first;
}

export async function detectGitEnvironment(
  cwd = os.tmpdir(),
  runners: { git?: CommandRunner; gh?: CommandRunner } = {},
) {
  const git = runners.git ?? runGit;
  const gh = runners.gh ?? runGh;
  const probe = async (runner: CommandRunner, args: string[]) => {
    try { return await runner(cwd, args); }
    catch { return null; }
  };
  const [gitVersion, ghVersion] = await Promise.all([probe(git, ["--version"]), probe(gh, ["--version"])]);
  const auth = ghVersion?.ok ? await probe(gh, ["auth", "status", "--hostname", "github.com"]) : null;
  const ghUsername = auth?.ok ? parseGhUsername(auth.stdout + "\n" + auth.stderr) : null;
  return {
    gitInstalled: gitVersion?.ok === true,
    gitVersion: gitVersion?.ok ? /^git version\s+(\S+)/.exec(gitVersion.stdout)?.[1] ?? null : null,
    gitInstallHint: "winget install Git.Git",
    gitDownloadUrl: "https://git-scm.com/downloads",
    ghInstalled: ghVersion?.ok === true,
    ghVersion: ghVersion?.ok ? /^gh version\s+(\S+)/.exec(ghVersion.stdout)?.[1] ?? null : null,
    ghInstallHint: "winget install GitHub.cli",
    ghDownloadUrl: "https://cli.github.com/",
    ghAuthenticated: ghUsername !== null,
    ghUsername,
  };
}
