import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { ApiRequestError } from "@/lib/api-client";
import { CloudBackupDialog } from "./CloudBackupDialog.js";
import { GhLoginDialog } from "./GhLoginDialog.js";
import { GitSettingsSection } from "./GitSettingsSection.js";
import { fetchGitStatus, pollGhLogin, pushCloudBackup, setupCloudBackup, startGhLogin, toggleGit } from "./api.js";
import type { CloudRepoSetupInput, GhLoginSession, GitStatusData, SecretFinding } from "./types.js";

interface GitSettingsPanelProps {
  onEnabledChange: (enabled: boolean) => void;
  /** The onboarding switch records intent until the inventory is initialized. */
  enableOnInit?: boolean;
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const POLL_INTERVAL_MS = 1000;

export function GitSettingsPanel({ onEnabledChange, enableOnInit }: GitSettingsPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<GitStatusData | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loginOpen, setLoginOpen] = useState(false);
  const [login, setLogin] = useState<GhLoginSession | null>(null);
  const [startingLogin, setStartingLogin] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [findings, setFindings] = useState<SecretFinding[]>([]);
  const loginRequest = useRef<AbortController | null>(null);
  const onboarding = enableOnInit !== undefined;
  const loginPending = login?.status === "pending";
  const sessionId = login?.sessionId;

  useEffect(() => {
    const request = new AbortController();
    void fetchGitStatus(request.signal).then(
      (data) => {
        if (request.signal.aborted) return;
        setStatus(data);
        setStatusError(null);
        if (!onboarding) onEnabledChange(data.enabled);
      },
      (error: unknown) => {
        if (!request.signal.aborted) setStatusError(errorMessage(error));
      },
    );
    return () => request.abort();
  }, [revision, onEnabledChange, onboarding]);

  useEffect(() => () => loginRequest.current?.abort(), []);

  useEffect(() => {
    if (!loginOpen || !loginPending || sessionId === undefined) return;
    const request = new AbortController();
    let timer: number;
    const schedule = (): void => {
      timer = window.setTimeout(() => {
        void pollGhLogin(sessionId, request.signal).then(
          (next) => {
            if (request.signal.aborted) return;
            if (next.status === "pending") {
              schedule();
            } else if (next.status === "authenticated") {
              setLoginOpen(false);
              setLogin(null);
              setStatus((previous) => previous === null ? null : {
                ...previous, ghAuthenticated: true, ghUsername: next.username ?? null,
              });
              toast.success(next.username ? "已登录 @" + next.username : "GitHub 已授权");
              setRevision((count) => count + 1);
            } else {
              setLogin((current) => current === null ? null : { ...current, ...next });
            }
          },
          (error: unknown) => {
            if (!request.signal.aborted) {
              setLogin((current) => current === null ? null : { ...current, status: "error", error: errorMessage(error) });
            }
          },
        );
      }, POLL_INTERVAL_MS);
    };
    schedule();
    return () => {
      request.abort();
      window.clearTimeout(timer);
    };
  }, [loginOpen, loginPending, sessionId]);

  const changeLoginOpen = (open: boolean): void => {
    setLoginOpen(open);
    if (!open) {
      loginRequest.current?.abort();
      loginRequest.current = null;
      setStartingLogin(false);
      setLogin(null);
    }
  };

  const beginLogin = async (): Promise<void> => {
    loginRequest.current?.abort();
    const request = new AbortController();
    loginRequest.current = request;
    setStartingLogin(true);
    try {
      const session = await startGhLogin(request.signal);
      if (!request.signal.aborted) setLogin(session);
    } catch (error) {
      if (!request.signal.aborted) throw error;
    } finally {
      if (loginRequest.current === request) {
        loginRequest.current = null;
        setStartingLogin(false);
      }
    }
  };

  const changeEnabled = async (enabled: boolean): Promise<void> => {
    if (enableOnInit !== undefined) {
      onEnabledChange(enabled);
      return;
    }
    const value = await toggleGit(enabled);
    setStatus((previous) => previous === null ? null : { ...previous, enabled: value });
    onEnabledChange(value);
    setRevision((count) => count + 1);
  };

  const setup = async (input: CloudRepoSetupInput): Promise<void> => {
    const result = await setupCloudBackup(input);
    if ("findings" in result) {
      setFindings(result.findings);
      return;
    }
    setCloudOpen(false);
    setStatus((previous) => previous === null ? null : { ...previous, remoteUrl: result.remoteUrl });
    toast.success("已创建并推送云端备份");
    setRevision((count) => count + 1);
  };

  const push = async (): Promise<void> => {
    try {
      await pushCloudBackup();
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "remote-diverged") {
        setStatus((previous) => previous === null ? null : { ...previous, remoteDiverged: true });
        return;
      }
      throw error;
    }
    toast.success("已推送云端备份");
    setRevision((count) => count + 1);
  };

  return (
    <>
      {statusError !== null && (
        <div className="space-y-2">
          <StatusBanner tone="warning" title="无法检测 Git 环境" description={statusError} surface="card" />
          <Button type="button" variant="outline" size="sm" onClick={() => setRevision((count) => count + 1)}>
            重新检测
          </Button>
        </div>
      )}
      {status === null && statusError === null && (
        <Skeleton className="h-28 w-full" aria-label="正在检测 Git 与 GitHub CLI" />
      )}
      {status !== null && (
        <GitSettingsSection
          status={enableOnInit === undefined ? status : { ...status, enabled: status.gitInstalled && enableOnInit }}
          showCloud={enableOnInit === undefined}
          onToggleGit={changeEnabled}
          onOpenGhLogin={() => {
            setLoginOpen(true);
            void beginLogin().catch((error: unknown) => toast.error(errorMessage(error)));
          }}
          onOpenCloudSetup={() => {
            setFindings([]);
            setCloudOpen(true);
          }}
          onPushBackup={push}
        />
      )}
      {loginOpen && (
        <GhLoginDialog
          open onOpenChange={changeLoginOpen}
          session={login} starting={startingLogin} onStartLogin={beginLogin}
        />
      )}
      {cloudOpen && (
        <CloudBackupDialog open onOpenChange={setCloudOpen} secretFindings={findings} onCreateAndPush={setup} />
      )}
    </>
  );
}
