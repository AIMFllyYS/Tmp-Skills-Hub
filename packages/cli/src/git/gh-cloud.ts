import { getGitStatus } from "./git-repo.js";
import { parseGhUsername, runGh, runGit, scanGitHistorySecrets, type CommandRunner } from "./git-runner.js";
import { redactGitSecrets, scanSecretsInDir, type SecretFinding } from "./secret-scan.js";

export interface CloudBackupOptions {
  repoName: string;
  visibility: "private" | "public";
  confirmPublicSecrets?: boolean;
}

export interface GitCloudRunners {
  git?: CommandRunner;
  gh?: CommandRunner;
  scanHistory?: (skillsRoot: string) => Promise<SecretFinding[]>;
}

export type GitCloudFailureCode = "bad-usage" | "git-unavailable" | "auth-required" | "secret-detected" |
  "remote-conflict" | "remote-diverged" | "github-push-failed" | "io-error";

type CloudResult = { ok: true; remoteUrl: string } | {
  ok: false; code: GitCloudFailureCode; message: string; findings?: SecretFinding[];
};

const fail = (code: GitCloudFailureCode, message: string) => ({ ok: false as const, code, message });

export function isCloudRepoName(name: string): boolean {
  return /^[a-z0-9_][a-z0-9._-]{0,99}$/i.test(name) &&
    !name.endsWith(".") && !name.endsWith("-") && !name.toLowerCase().endsWith(".git");
}

/** Accept GitHub origins only, and return a link without protocols or user information from Git config. */
export function githubRepoUrl(remote: string): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([a-z0-9][a-z0-9-]*)\/([a-z0-9._-]+?)(?:\.git)?\/?$/i.exec(remote);
  return match ? "https://github.com/" + match[1] + "/" + match[2] : null;
}

async function inspectRepo(skillsRoot: string, git: CommandRunner) {
  if (!(await git(skillsRoot, ["--version"])).ok) return fail("git-unavailable", "未找到 Git，请先安装 Git。");
  const status = await getGitStatus(skillsRoot, git);
  if (!status.initialized || status.branch === null) return fail("bad-usage", "请先启用 Git 并切换到有效分支。");
  return { ok: true as const, status };
}

export async function setupCloudBackupRepo(skillsRoot: string, input: CloudBackupOptions, runners: GitCloudRunners = {}): Promise<CloudResult> {
  const git = runners.git ?? runGit;
  const gh = runners.gh ?? runGh;
  if (!isCloudRepoName(input.repoName)) return fail("bad-usage", "仓库名称无效，请使用 1 到 100 个字母、数字、点、下划线或连字符。");
  const repo = await inspectRepo(skillsRoot, git);
  if (!repo.ok) return repo;
  if (repo.status.remoteUrl !== null) return fail("remote-conflict", "此真源已配置 origin。保留现有远端，请用立即推送或在 Git 中确认远端设置。");
  if (input.visibility === "public") {
    const [current, history] = await Promise.all([
      scanSecretsInDir(skillsRoot), (runners.scanHistory ?? scanGitHistorySecrets)(skillsRoot),
    ]);
    const findings = [...new Map([...current, ...history].map((item) => [JSON.stringify(item), item])).values()].slice(0, 100);
    if (findings.length > 0 && input.confirmPublicSecrets !== true) {
      return { ...fail("secret-detected", "公开备份发现疑似密钥，请查看脱敏位置并确认。"), findings };
    }
  }
  const auth = await gh(skillsRoot, ["auth", "status", "--hostname", "github.com"]);
  if (!auth.ok && auth.reason === "missing") return fail("git-unavailable", "请先安装 GitHub CLI。");
  const username = auth.ok ? parseGhUsername(auth.stdout + "\n" + auth.stderr) : null;
  if (username === null) return fail("auth-required", "请先用 GitHub CLI 设备码登录。");
  const created = await gh(skillsRoot, ["repo", "create", input.repoName, "--" + input.visibility,
    "--source", skillsRoot, "--remote", "origin", "--push"], { timeoutMs: 90_000 });
  if (!created.ok) {
    if (/already exists|already in use|remote origin already exists/i.test(created.stderr)) return fail("remote-conflict", "仓库名或 origin 已存在。请检查 GitHub 和本地远端。");
    return fail("github-push-failed", redactGitSecrets(created.message));
  }
  return { ok: true, remoteUrl: "https://github.com/" + username + "/" + input.repoName };
}

export async function pushCloudBackup(skillsRoot: string, runners: GitCloudRunners = {}): Promise<CloudResult> {
  const git = runners.git ?? runGit;
  const repo = await inspectRepo(skillsRoot, git);
  if (!repo.ok) return repo;
  const remoteUrl = repo.status.remoteUrl === null ? null : githubRepoUrl(repo.status.remoteUrl);
  if (remoteUrl === null) return fail("remote-conflict", "origin 需要指向已确认的 GitHub 备份仓库。");
  const destinations = await git(skillsRoot, ["remote", "get-url", "--push", "--all", "origin"]);
  const targets = destinations.ok ? destinations.stdout.trim().split(/\r?\n/) : [];
  if (targets.length !== 1 || githubRepoUrl(targets[0]!)?.toLowerCase() !== remoteUrl.toLowerCase()) {
    return fail("remote-conflict", "origin 的推送地址与已确认的 GitHub 仓库不一致。");
  }
  const diverged = () => fail("remote-diverged", "远端有本地未合并的提交。请先拉取并合并，再重新推送。");
  if (repo.status.remoteDiverged) return diverged();
  const pushed = await git(skillsRoot, ["push", "-u", "origin", "HEAD"], { timeoutMs: 90_000 });
  if (!pushed.ok) {
    if (/non-fast-forward|fetch first|behind its remote/i.test(pushed.stderr + "\n" + pushed.stdout)) return diverged();
    return fail("github-push-failed", redactGitSecrets(pushed.message));
  }
  return { ok: true, remoteUrl };
}
