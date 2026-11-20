import { ApiRequestError, apiRequest } from "@/lib/api-client";
import type { CloudRepoSetupInput, GhLoginSession, GitCommitEntry, GitStatusData, SecretFinding } from "./types.js";

export function fetchGitStatus(signal?: AbortSignal): Promise<GitStatusData> {
  return apiRequest<{ ok: true } & GitStatusData>("/api/git/status", signal === undefined ? {} : { signal });
}

export async function toggleGit(enabled: boolean): Promise<boolean> {
  const result = await apiRequest<{ ok: true; enabled: boolean }>("/api/git/toggle", {
    method: "POST", body: { enabled },
  });
  return result.enabled;
}

export async function startGhLogin(signal: AbortSignal): Promise<GhLoginSession> {
  const result = await apiRequest<{ ok: true; verificationUri: string } & Omit<GhLoginSession, "verificationUrl">>(
    "/api/git/gh/login/start", { method: "POST", body: {}, signal },
  );
  if (result.verificationUri !== "https://github.com/login/device") {
    throw new Error("GitHub 返回了无效的设备验证地址。");
  }
  return { ...result, verificationUrl: result.verificationUri };
}

export function pollGhLogin(sessionId: string, signal: AbortSignal): Promise<
  Pick<GhLoginSession, "status" | "username" | "error">
> {
  return apiRequest<{ ok: true } & Pick<GhLoginSession, "status" | "username" | "error">>(
    "/api/git/gh/login/status?" + new URLSearchParams({ sessionId }), { signal },
  );
}

function isSecretFinding(value: unknown): value is SecretFinding {
  return typeof value === "object" && value !== null &&
    "file" in value && typeof value.file === "string" &&
    "line" in value && typeof value.line === "number" &&
    "preview" in value && typeof value.preview === "string";
}

export async function setupCloudBackup(input: CloudRepoSetupInput): Promise<
  { remoteUrl: string } | { findings: SecretFinding[] }
> {
  try {
    return await apiRequest<{ ok: true; remoteUrl: string }>("/api/git/cloud/setup", { method: "POST", body: input });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 409 && error.code === "secret-detected") {
      const payload = error.payload;
      if (typeof payload === "object" && payload !== null && "findings" in payload && Array.isArray(payload.findings)) {
        const findings = payload.findings.filter(isSecretFinding);
        if (findings.length > 0) return { findings };
      }
    }
    throw error;
  }
}

export async function pushCloudBackup(): Promise<void> {
  await apiRequest<{ ok: true }>("/api/git/cloud/push", { method: "POST", body: {} });
}

export async function fetchSkillHistory(skill: string, signal: AbortSignal): Promise<GitCommitEntry[]> {
  const result = await apiRequest<{ ok: true; commits: GitCommitEntry[] }>(
    "/api/git/log?" + new URLSearchParams({ skill }), { signal },
  );
  return result.commits;
}

export async function fetchCommitPatch(skill: string, commit: string, signal: AbortSignal): Promise<string> {
  const result = await apiRequest<{ ok: true; patch: string }>(
    "/api/git/diff?" + new URLSearchParams({ skill, commit }), { signal },
  );
  return result.patch;
}
