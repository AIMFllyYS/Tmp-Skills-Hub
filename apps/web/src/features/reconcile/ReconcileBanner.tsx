import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ICON_STROKE } from "@/components/ui/icon";
import { StatusBanner } from "@/components/ui/status-banner";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  formatReconcileBannerCopy,
  hasReconcileActionableItems,
  type ReconcileBannerCopy,
  type ReconcileScanSummary,
} from "./types.js";

export { formatReconcileBannerCopy, hasReconcileActionableItems, type ReconcileBannerCopy };

export interface ReconcileBannerProps {
  summary: ReconcileScanSummary | null;
  dismissed?: boolean;
  surface?: "bar" | "card";
  onOpenDialog: () => void;
  onDismiss?: () => void;
  className?: string;
}

/** 全局/页顶非阻塞巡检提醒横幅：发现未接管真目录、覆写软链或同名冲突时提示一键查看并合并。 */
export function ReconcileBanner({
  summary,
  dismissed = false,
  surface = "bar",
  onOpenDialog,
  onDismiss,
  className,
}: ReconcileBannerProps): React.JSX.Element | null {
  if (dismissed || !hasReconcileActionableItems(summary)) return null;
  const copy = formatReconcileBannerCopy(summary);

  return (
    <StatusBanner
      tone={copy.tone}
      surface={surface}
      title={copy.title}
      description={copy.description}
      testId="reconcile-banner"
      action={
        <Button
          type="button"
          size="sm"
          onClick={onOpenDialog}
          data-testid="reconcile-open-dialog"
        >
          查看并合并
        </Button>
      }
      {...(onDismiss !== undefined ? { onDismiss } : {})}
      {...(className !== undefined ? { className } : {})}
    />
  );
}

export interface RescanTriggerButtonProps {
  scanning?: boolean;
  onRescan: () => void | Promise<void>;
  label?: string;
  scanningLabel?: string;
  iconOnly?: boolean;
  className?: string;
}

/** 轻量手动重新扫描触发按钮：支持扫描中禁用态与侧栏收起态图标模式。 */
export function RescanTriggerButton({
  scanning = false,
  onRescan,
  label = "重新扫描",
  scanningLabel = "扫描中…",
  iconOnly = false,
  className,
}: RescanTriggerButtonProps): React.JSX.Element {
  const currentLabel = scanning ? scanningLabel : label;

  const handleClick = (): void => {
    void Promise.resolve(onRescan()).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    });
  };

  const button = (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      disabled={scanning}
      aria-label={currentLabel}
      aria-busy={scanning}
      data-testid="reconcile-rescan-button"
      onClick={handleClick}
      className={cn(className)}
    >
      <RefreshCw
        className={cn("size-3.5 shrink-0 text-ink-mid", scanning && "motion-safe:animate-spin")}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
      {!iconOnly && <span>{currentLabel}</span>}
    </Button>
  );

  if (iconOnly) {
    return (
      <Tooltip label={currentLabel} side="right">
        {button}
      </Tooltip>
    );
  }
  return button;
}
