import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ICON_STROKE, IconBadge, ShieldAuditGlyph } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { StepList, type StepItem } from "@/components/ui/step-list";
import type { GhLoginSession } from "./types.js";

export interface GhLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: GhLoginSession | null;
  starting?: boolean;
  onStartLogin: () => Promise<void>;
  onCopyAndOpen?: (code: string, url: string) => void;
}

function buildLoginSteps(session: GhLoginSession): StepItem[] {
  const stepRequest: StepItem = {
    id: "request",
    title: "获取一次性设备验证码",
    detail: "验证码 " + session.userCode + " 已就绪",
    status: "done",
  };

  if (session.status === "authenticated") {
    const accountLabel =
      session.username !== undefined && session.username !== null && session.username !== ""
        ? "@" + session.username
        : "GitHub 账号";
    return [
      stepRequest,
      {
        id: "authorize",
        title: "浏览器设备码授权已完成",
        detail: "GitHub 已确认本次一次性授权",
        status: "done",
      },
      {
        id: "complete",
        title: "已登录 " + accountLabel,
        detail: "现在可以返回设置一键创建并推送云端备份仓库",
        status: "done",
      },
    ];
  }

  if (session.status === "expired") {
    return [
      stepRequest,
      {
        id: "authorize",
        title: "一次性设备码已过期",
        detail: "等待授权超时，请点击下方按钮重新获取设备码",
        status: "warning",
      },
      {
        id: "complete",
        title: "完成 gh CLI 登录同步",
        detail: "尚未完成身份确认",
        status: "idle",
      },
    ];
  }

  if (session.status === "error") {
    return [
      stepRequest,
      {
        id: "authorize",
        title: "授权状态检测失败",
        detail:
          session.error !== undefined && session.error !== null && session.error !== ""
            ? session.error
            : "请检查网络连接或本机 gh CLI 状态后重试",
        status: "error",
      },
      {
        id: "complete",
        title: "完成 gh CLI 登录同步",
        detail: "尚未完成身份确认",
        status: "idle",
      },
    ];
  }

  return [
    stepRequest,
    {
      id: "authorize",
      title: "等待你在浏览器完成 GitHub 授权",
      detail: "粘贴上方 8 位验证码并确认后，面板会自动轮询登录结果…",
      status: "active",
    },
    {
      id: "complete",
      title: "完成 gh CLI 登录同步",
      detail: "授权成功后自动更新账号状态",
      status: "idle",
    },
  ];
}

/** GitHub CLI (gh) 设备码 Web 授权引导弹窗：大号等宽验证码 + 一键复制打开 + 实时轮询步骤条。 */
export function GhLoginDialog({
  open,
  onOpenChange,
  session,
  starting = false,
  onStartLogin,
  onCopyAndOpen,
}: GhLoginDialogProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [localStarting, setLocalStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const isStarting = starting || localStarting;

  const handleStart = async (): Promise<void> => {
    setLocalStarting(true);
    setStartError(null);
    try {
      await onStartLogin();
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalStarting(false);
    }
  };

  const handleCopyAndOpen = (): void => {
    if (session === null) return;
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(session.userCode).then(
        () => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        },
        () => undefined,
      );
    }
    if (onCopyAndOpen !== undefined) {
      onCopyAndOpen(session.userCode, session.verificationUrl);
    } else if (typeof window !== "undefined") {
      window.open(session.verificationUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4" data-testid="gh-login-dialog">
        <div className="flex items-start gap-3">
          <IconBadge size="md" tone="obsidian">
            <KeyRound className="size-4" strokeWidth={ICON_STROKE} />
          </IconBadge>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle>通过 gh 登录 GitHub</DialogTitle>
              {session?.status === "authenticated" && <Badge tone="success" dot>已授权</Badge>}
              {session?.status === "pending" && <Badge tone="slate" dot>等待授权</Badge>}
              {session?.status === "expired" && <Badge tone="warning" dot>已过期</Badge>}
              {session?.status === "error" && <Badge tone="danger" dot>异常</Badge>}
            </div>
            <DialogDescription>
              使用 GitHub 官方设备码（Device Flow）完成本机 gh CLI 登录，无需手动申请或复制 Token。
            </DialogDescription>
          </div>
        </div>

        {session === null ? (
          isStarting ? (
            <div className="space-y-3" aria-busy="true" aria-label="正在获取设备验证码">
              <Skeleton className="h-24 w-full rounded-xl" />
              <StepList
                items={[
                  {
                    id: "init",
                    title: "正在向 GitHub 请求一次性设备码…",
                    detail: "由本机 gh auth login 发起标准 OAuth 设备流",
                    status: "active",
                  },
                ]}
              />
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-line bg-canvas p-4">
              <p className="text-sm leading-relaxed text-ink-mid">
                点击下方按钮获取 8 位一次性设备码，随后在浏览器中粘贴并确认即可完成授权。
              </p>
              <Button
                type="button"
                variant="default"
                className="w-full"
                data-testid="gh-login-start"
                onClick={() => void handleStart()}
              >
                <KeyRound className="size-4 text-white" strokeWidth={ICON_STROKE} aria-hidden />
                获取一次性设备码
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line bg-canvas px-4 py-5 text-center shadow-[var(--shadow-card)]">
              <p className="text-[11px] font-medium uppercase tracking-widest text-ink-faint">
                一次性设备验证码
              </p>
              <p
                data-testid="gh-device-code"
                className="mt-2 select-all font-mono text-2xl font-semibold tracking-[0.24em] text-ink-strong"
              >
                {session.userCode}
              </p>
              <p className="mt-2 truncate font-mono text-xs text-ink-mid">
                {session.verificationUrl}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="default"
                className="w-full"
                data-testid="gh-copy-and-open"
                disabled={session.status === "expired" || session.status === "authenticated"}
                onClick={handleCopyAndOpen}
              >
                {copied ? (
                  <Check className="size-4 text-white" strokeWidth={ICON_STROKE} aria-hidden />
                ) : (
                  <Copy className="size-4 text-white" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                <span>{copied ? "已复制验证码并打开授权页" : "复制验证码并打开 GitHub 授权页"}</span>
                <ExternalLink className="size-3.5 text-white/80" strokeWidth={ICON_STROKE} aria-hidden />
              </Button>

              {(session.status === "expired" || session.status === "error") && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  data-testid="gh-login-retry"
                  disabled={isStarting}
                  onClick={() => void handleStart()}
                >
                  <RefreshCw className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
                  {isStarting ? "重新获取中…" : "重新获取设备码"}
                </Button>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-white p-4">
              <StepList items={buildLoginSteps(session)} />
            </div>
          </div>
        )}

        {startError !== null && (
          <p className="text-xs text-red-700" role="alert">
            {startError}
          </p>
        )}

        <div className="flex items-start gap-2.5 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-ink-mid">
          <ShieldAuditGlyph size={16} className="mt-0.5 text-ink-mid" />
          <span>
            凭据安全说明：授权凭据仅由本机官方 gh CLI 托管，Skills Hub 全程不读取、不记录、不保存任何明文 GitHub Token。
          </span>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant={session?.status === "authenticated" ? "default" : "outline"}
            onClick={() => onOpenChange(false)}
          >
            {session?.status === "authenticated" ? "完成" : "关闭"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
