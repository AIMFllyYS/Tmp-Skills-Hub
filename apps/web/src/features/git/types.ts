/** 本机 Git 与 GitHub CLI (gh) 运行环境及云端备份状态（对齐 PRD §3.5）。 */
export interface GitStatusData {
  enabled: boolean;
  gitInstalled: boolean;
  gitVersion?: string | null;
  gitInstallHint?: string;
  gitDownloadUrl?: string;
  ghInstalled: boolean;
  ghVersion?: string | null;
  ghInstallHint?: string;
  ghDownloadUrl?: string;
  ghAuthenticated: boolean;
  ghUsername?: string | null;
  initialized?: boolean;
  branch?: string | null;
  remoteUrl?: string | null;
  aheadCount?: number;
  dirtyCount?: number;
  remoteDiverged?: boolean;
}

/** GitHub CLI 设备码 Web 授权会话状态。 */
export interface GhLoginSession {
  sessionId: string;
  userCode: string;
  verificationUrl: string;
  status: "pending" | "authenticated" | "expired" | "error";
  username?: string | null;
  error?: string | null;
  expiresAt?: string | null;
}

/** 公开仓库推送前的脱敏密钥预检命中项（绝不含明文凭据）。 */
export interface SecretFinding {
  file: string;
  line: number;
  preview: string;
  rule?: string;
}

/** 一键创建 GitHub 云端备份仓库的提交载荷。 */
export interface CloudRepoSetupInput {
  repoName: string;
  visibility: "private" | "public";
  confirmPublicSecrets?: boolean;
}

/** 单个 Skill 的 Git 提交历史条目。 */
export interface GitCommitEntry {
  hash: string;
  shortHash: string;
  timestamp: string;
  author: string;
  message: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
}

export const DEFAULT_GIT_INSTALL_CMD = "winget install Git.Git";
export const DEFAULT_GIT_DOWNLOAD_URL = "https://git-scm.com/downloads";
export const DEFAULT_GH_INSTALL_CMD = "winget install GitHub.cli";
export const DEFAULT_GH_DOWNLOAD_URL = "https://cli.github.com/";
export const DEFAULT_CLOUD_REPO_NAME = "my-skills-hub-backup";

const REPO_NAME_ALLOWED_RE = /^[A-Za-z0-9._-]+$/;

/**
 * 校验 GitHub 仓库名称合法性。
 * 返回 null 表示合法；返回非空字符串表示中文错误说明。
 */
export function validateRepoName(name: string): string | null {
  if (name.trim() === "") {
    return "请输入仓库名称";
  }
  if (name !== name.trim() || /\s/.test(name)) {
    return "仓库名称不能包含空格";
  }
  if (name.length > 100) {
    return "仓库名称不能超过 100 个字符";
  }
  if (!REPO_NAME_ALLOWED_RE.test(name)) {
    return "仅支持英文字母、数字、连字符（-）、下划线（_）和点（.）";
  }
  if (name === "." || name === ".." || name.startsWith(".") || name.endsWith(".")) {
    return "仓库名称不能以点（.）开头或结尾";
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return "仓库名称不能以连字符（-）开头或结尾";
  }
  if (name.toLowerCase().endsWith(".git")) {
    return "仓库名称不能以 .git 结尾";
  }
  return null;
}

/** 将提交 ISO 时间戳格式化为可读的相对时间或 YYYY-MM-DD HH:mm。 */
export function formatCommitTimestamp(iso: string, nowMs: number = Date.now()): string {
  const date = new Date(iso);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return iso;

  const diffSeconds = Math.floor((nowMs - ms) / 1000);
  if (diffSeconds >= 0 && diffSeconds < 60) return "刚刚";
  if (diffSeconds >= 60 && diffSeconds < 3600) {
    return String(Math.floor(diffSeconds / 60)) + " 分钟前";
  }
  if (diffSeconds >= 3600 && diffSeconds < 86400) {
    return String(Math.floor(diffSeconds / 3600)) + " 小时前";
  }
  if (diffSeconds >= 86400 && diffSeconds < 86400 * 7) {
    return String(Math.floor(diffSeconds / 86400)) + " 天前";
  }

  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    String(date.getFullYear()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}
