import { useState } from "react";
import {
  Cloud,
  CloudUpload,
  ExternalLink,
  KeyRound,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { GitVaultGlyph, ICON_STROKE, IconBadge } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StatusBanner } from "@/components/ui/status-banner";
import { Switch } from "@/components/ui/switch";
import { TruncateTip } from "@/components/ui/tooltip";
import {
  DEFAULT_GH_DOWNLOAD_URL,
  DEFAULT_GH_INSTALL_CMD,
  DEFAULT_GIT_DOWNLOAD_URL,
  DEFAULT_GIT_INSTALL_CMD,
  type GitStatusData,
} from "./types.js";

export interface GitSettingsSectionProps {
  status: GitStatusData;
  busy?: boolean;
  onToggleGit: (enabled: boolean) => Promise<void>;
  onOpenGhLogin: () => void;
  onOpenCloudSetup: () => void;
  onPushBackup: () => Promise<void>;
}

function InstallHintRow({
  command,
  downloadUrl,
  toolName,
}: {
  command: string;
  downloadUrl: string;
  toolName: string;
}): React.JSX.Element {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-strong">{command}</code>
      <CopyButton
        value={command}
        iconOnly
        label="复制安装命令"
        copiedLabel="已复制命令"
        ariaLabel={"复制 " + toolName + " 安装命令"}
      />
      <a
        href={downloadUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-strong underline-offset-4 hover:underline"
      >
        官方下载
        <ExternalLink className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
      </a>
    </div>
  );
}

/** 设置页与引导页共享的 Git 版本控制 & GitHub CLI 云端备份配置区块。 */
export function GitSettingsSection({
  status,
  busy = false,
  onToggleGit,
  onOpenGhLogin,
  onOpenCloudSetup,
  onPushBackup,
}: GitSettingsSectionProps): React.JSX.Element {
  const [localBusy, setLocalBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const effectiveBusy = busy || localBusy;
  const gitCmd = status.gitInstallHint ?? DEFAULT_GIT_INSTALL_CMD;
  const gitUrl = status.gitDownloadUrl ?? DEFAULT_GIT_DOWNLOAD_URL;
  const ghCmd = status.ghInstallHint ?? DEFAULT_GH_INSTALL_CMD;
  const ghUrl = status.ghDownloadUrl ?? DEFAULT_GH_DOWNLOAD_URL;
  const hasRemote = status.remoteUrl !== undefined && status.remoteUrl !== null && status.remoteUrl !== "";
  const aheadCount = status.aheadCount ?? 0;

  const handleToggle = async (next: boolean): Promise<void> => {
    setLocalBusy(true);
    setActionError(null);
    try {
      await onToggleGit(next);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  };

  const handlePush = async (): Promise<void> => {
    setLocalBusy(true);
    setActionError(null);
    try {
      await onPushBackup();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="git-settings-section">
      <div className="flex items-start gap-3">
        <IconBadge size="md" tone="obsidian">
          <GitVaultGlyph size={18} />
        </IconBadge>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-base font-semibold tracking-tight text-ink-strong">Git 版本控制与云端备份</h3>
          <p className="text-xs leading-relaxed text-ink-mid">
            可选功能（可跳过，随时在设置中开启）：在唯一真源目录自动记录变更历史，并可通过官方 GitHub CLI 备份到个人仓库。
          </p>
        </div>
      </div>

      {actionError !== null && (
        <StatusBanner
          tone="danger"
          surface="card"
          title="Git 操作未能完成"
          description={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      <Card className="space-y-4" data-testid="git-env-card">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-mid">
          <Terminal className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
          <span>本机环境检测</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-canvas/60 p-3.5" data-testid="git-env-git">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-strong">Git</span>
              {status.gitInstalled ? (
                <Badge tone="success" dot>
                  {status.gitVersion !== undefined && status.gitVersion !== null && status.gitVersion !== ""
                    ? "已安装 " + status.gitVersion
                    : "已安装"}
                </Badge>
              ) : (
                <Badge tone="warning" dot>
                  未安装
                </Badge>
              )}
            </div>
            {status.gitInstalled ? (
              <p className="mt-2 text-xs text-ink-faint">可用于唯一真源本地自动提交与历史对比。</p>
            ) : (
              <InstallHintRow command={gitCmd} downloadUrl={gitUrl} toolName="Git" />
            )}
          </div>

          <div className="rounded-xl border border-line bg-canvas/60 p-3.5" data-testid="git-env-gh">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink-strong">GitHub CLI (gh)</span>
              {!status.ghInstalled ? (
                <Badge tone="warning" dot>
                  未安装
                </Badge>
              ) : status.ghAuthenticated ? (
                <Badge tone="success" dot>
                  {status.ghUsername !== undefined &&
                  status.ghUsername !== null &&
                  status.ghUsername !== ""
                    ? "@" + status.ghUsername
                    : "已登录"}
                </Badge>
              ) : (
                <Badge tone="neutral" dot>
                  未登录
                </Badge>
              )}
            </div>
            {!status.ghInstalled ? (
              <InstallHintRow command={ghCmd} downloadUrl={ghUrl} toolName="GitHub CLI" />
            ) : (
              <p className="mt-2 text-xs text-ink-faint">
                {status.ghVersion !== undefined && status.ghVersion !== null && status.ghVersion !== ""
                  ? "版本 " + status.ghVersion + " · "
                  : ""}
                {status.ghAuthenticated
                  ? "已通过官方 gh CLI 授权，无明文 Token 落盘。"
                  : "已安装，开启 Git 后可通过设备码登录云端备份。"}
              </p>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor="git-enable-switch">使用 Git 管理 Skills 版本</Label>
            <p className="text-xs text-ink-mid">
              {!status.gitInstalled
                ? "检测到本机未安装 Git，请先按上方指引安装后再开启。"
                : status.enabled
                  ? "已开启：保存、收录、冲突合并与归档后自动写入本地提交记录。"
                  : "开启后仅初始化唯一真源目录，绝不修改全局 ~/.gitconfig。"}
            </p>
          </div>
          <Switch
            id="git-enable-switch"
            data-testid="git-enable-switch"
            checked={status.enabled}
            disabled={!status.gitInstalled || effectiveBusy}
            onCheckedChange={(next) => {
              void handleToggle(next);
            }}
          />
        </div>
      </Card>

      {status.enabled && status.gitInstalled && (
        <Card className="space-y-3.5 bg-canvas/70" data-testid="git-cloud-section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconBadge size="xs" tone="neutral">
                <Cloud className="size-3.5" strokeWidth={ICON_STROKE} />
              </IconBadge>
              <span className="text-sm font-medium text-ink-strong">GitHub 云端备份</span>
            </div>
            {status.branch !== undefined && status.branch !== null && status.branch !== "" && (
              <Badge tone="slate" className="font-mono">
                {status.branch}
              </Badge>
            )}
          </div>

          {!status.ghAuthenticated && !hasRemote && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-control)]">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-mid">
                {status.ghInstalled
                  ? "登录认证完全委托给本机官方 gh CLI，Skills Hub 不读取、不保存任何明文 Token。"
                  : "请先安装上方 GitHub CLI (gh) 后，再通过设备码登录 GitHub 完成一键云端备份。"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="git-open-gh-login"
                disabled={!status.ghInstalled || effectiveBusy}
                onClick={onOpenGhLogin}
              >
                <KeyRound className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
                通过 gh 登录 GitHub
              </Button>
            </div>
          )}

          {status.ghAuthenticated && !hasRemote && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-control)]">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-mid">
                已连接账号{" "}
                <span className="font-medium text-ink-strong">
                  {status.ghUsername !== undefined &&
                  status.ghUsername !== null &&
                  status.ghUsername !== ""
                    ? "@" + status.ghUsername
                    : "GitHub"}
                </span>
                ，尚未绑定云端备份仓库。默认推荐创建私有仓库（Private）。
              </p>
              <Button
                type="button"
                variant="default"
                size="sm"
                data-testid="git-open-cloud-setup"
                disabled={effectiveBusy}
                onClick={onOpenCloudSetup}
              >
                <CloudUpload className="size-3.5 text-white" strokeWidth={ICON_STROKE} aria-hidden />
                一键创建云端备份仓库
              </Button>
            </div>
          )}

          {hasRemote && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3.5 shadow-[var(--shadow-control)]">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={status.remoteUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-mono text-xs font-medium text-ink-strong underline-offset-4 hover:underline"
                    >
                      <TruncateTip text={status.remoteUrl ?? ""} className="min-w-0 flex-1" />
                      <ExternalLink className="size-3.5 shrink-0 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
                    </a>
                    <Badge tone={aheadCount > 0 ? "warning" : "success"} dot data-testid="git-ahead-badge">
                      {aheadCount > 0 ? "待推送 " + String(aheadCount) + " 个提交" : "已与远端同步"}
                    </Badge>
                  </div>
                  {status.dirtyCount !== undefined && status.dirtyCount > 0 && (
                    <p className="text-xs text-ink-faint">
                      工作区存在 {String(status.dirtyCount)} 处未提交变更，将在下次操作时自动归档提交。
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!status.ghAuthenticated && status.ghInstalled && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={effectiveBusy}
                      onClick={onOpenGhLogin}
                    >
                      通过 gh 登录 GitHub
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    data-testid="git-push-backup"
                    disabled={effectiveBusy}
                    onClick={() => void handlePush()}
                  >
                    <CloudUpload className="size-3.5 text-white" strokeWidth={ICON_STROKE} aria-hidden />
                    {effectiveBusy ? "推送中…" : "立即推送备份"}
                  </Button>
                </div>
              </div>

              {status.remoteDiverged === true && (
                <StatusBanner
                  tone="warning"
                  surface="card"
                  testId="git-remote-diverged-banner"
                  title="远端仓库存在本地未拉取的新提交，已阻止推送"
                  description="为保护云端历史记录，Skills Hub 严禁执行 force push。请先在唯一真源目录执行 git pull --rebase 合并远端提交，再点击「立即推送备份」。"
                />
              )}
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
