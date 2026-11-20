import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { gitCommandEnvironment, parseGhUsername, runGh, type CommandRunner } from "./git-runner.js";
import { redactGitSecrets } from "./secret-scan.js";

const DEVICE_URI = "https://github.com/login/device";
const LOGIN_ARGS = ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"] as const;

export class GhLoginError extends Error {
  constructor(readonly code: "git-unavailable" | "gh-login-failed" | "not-found", message: string) {
    super(message);
  }
}

export interface GhLoginChallenge {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  status: "pending";
  expiresAt: string;
}

interface LoginState {
  sessionId: string;
  status: "pending" | "authenticated" | "expired" | "error";
  authenticated: boolean;
  username: string | null;
  error: string | null;
  expiresAt: string;
}

type LoginLauncher = (cwd: string, args: readonly string[], events: {
  output: (chunk: string) => void;
  exit: (code: number | null) => void;
  error: (error: NodeJS.ErrnoException) => void;
}) => () => void;

const launchGh: LoginLauncher = (cwd, args, events) => {
  const child = spawn("gh", args, {
    cwd, env: gitCommandEnvironment(), stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true,
  });
  const terminate = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  };
  process.once("exit", terminate);
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8").on("data", events.output);
  }
  child.once("error", events.error);
  child.once("close", (code) => {
    process.off("exit", terminate);
    events.exit(code);
  });
  return terminate;
};

interface Session {
  state: LoginState;
  challenge: GhLoginChallenge | null;
  ready: Promise<GhLoginChallenge> | null;
  stop: () => void;
}

export function createGhDeviceLogin({
  launch = launchGh,
  runner = runGh,
  expiresMs = 10 * 60 * 1000,
  challengeMs = 20_000,
}: {
  launch?: LoginLauncher;
  runner?: CommandRunner;
  expiresMs?: number;
  challengeMs?: number;
} = {}) {
  let latest: Session | null = null;

  function start(cwd: string): Promise<GhLoginChallenge> {
    if (latest?.state.status === "pending" && latest.ready !== null) return latest.ready;
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + expiresMs).toISOString();
    const state: LoginState = { sessionId, status: "pending", authenticated: false, username: null, error: null, expiresAt };
    let resolveChallenge!: (challenge: GhLoginChallenge) => void;
    let rejectChallenge!: (error: GhLoginError) => void;
    const ready = new Promise<GhLoginChallenge>((resolve, reject) => {
      resolveChallenge = resolve;
      rejectChallenge = reject;
    });
    const session: Session = { state, challenge: null, ready, stop: () => undefined };
    latest = session;
    let buffer = "";
    let terminate = () => {};

    const close = (status: LoginState["status"], error: GhLoginError | null = null, username: string | null = null) => {
      if (state.status !== "pending") return;
      state.status = status;
      state.error = error?.message ?? null;
      state.authenticated = username !== null;
      state.username = username;
      clearTimeout(expiration);
      clearTimeout(waitForDevice);
      buffer = "";
      if (session.challenge === null) rejectChallenge(error ?? new GhLoginError("gh-login-failed", "gh 未返回可用的设备码。"));
      session.challenge = null;
      session.ready = null;
    };
    const cancel = (status: "expired" | "error", error: GhLoginError) => {
      close(status, error);
      terminate();
    };
    session.stop = () => cancel("expired", new GhLoginError("gh-login-failed", "设备登录已结束，请重新开始。"));
    const expiration = setTimeout(session.stop, expiresMs);
    const waitForDevice = setTimeout(() => cancel(
      "error", new GhLoginError("gh-login-failed", "gh 未及时返回设备码，请检查网络或更新 GitHub CLI。"),
    ), challengeMs);
    try {
      terminate = launch(cwd, LOGIN_ARGS, {
        output(chunk) {
          if (state.status !== "pending" || session.challenge !== null) return;
          buffer = (buffer + redactGitSecrets(chunk)).slice(-4096);
          const code = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(buffer)?.[1];
          if (code === undefined || !buffer.includes(DEVICE_URI)) return;
          buffer = "";
          clearTimeout(waitForDevice);
          session.challenge = { sessionId, userCode: code, verificationUri: DEVICE_URI, status: "pending", expiresAt };
          resolveChallenge(session.challenge);
        },
        exit(code) {
          if (state.status !== "pending") return;
          if (code !== 0) {
            close("error", new GhLoginError("gh-login-failed", "GitHub CLI 登录未完成，请重新开始。"));
            return;
          }
          void runner(cwd, ["auth", "status", "--hostname", "github.com"], { timeoutMs: 8000 }).then((result) => {
            const username = result.ok ? parseGhUsername(result.stdout + "\n" + result.stderr) : null;
            if (username === null) close("error", new GhLoginError("gh-login-failed", "未找到已登录的 GitHub CLI 账户。"));
            else close("authenticated", null, username);
          }, () => close("error", new GhLoginError("gh-login-failed", "无法确认 GitHub CLI 已登录。")));
        },
        error(error) {
          close("error", new GhLoginError(
            error.code === "ENOENT" ? "git-unavailable" : "gh-login-failed",
            error.code === "ENOENT" ? "未找到 GitHub CLI，请先安装 gh。" : "无法启动 GitHub CLI 设备登录。",
          ));
        },
      });
    } catch {
      close("error", new GhLoginError("gh-login-failed", "无法启动 GitHub CLI 设备登录。"));
    }
    return ready;
  }

  function poll(sessionId: string): LoginState {
    if (latest === null || latest.state.sessionId !== sessionId) throw new GhLoginError("not-found", "设备登录会话不存在。");
    return { ...latest.state };
  }

  return { start, poll, dispose: () => { if (latest?.state.status === "pending") latest.stop(); } };
}

export type GhDeviceLogin = ReturnType<typeof createGhDeviceLogin>;
