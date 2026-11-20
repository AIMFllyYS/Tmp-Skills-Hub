import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge.js";
import { IconBadge } from "./icon.js";

export interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: string;
  deltaTone?: "neutral" | "slate" | "success" | "warning" | "danger";
  icon?: ReactNode;
  iconTone?: "neutral" | "surface" | "obsidian" | "slate" | "success" | "warning" | "danger";
  /** 可选 0..100 微进度条，使用统一 animate-bar-in 入场 */
  progressPct?: number;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}

/** 商务级 KPI 指标卡：建筑感图标锚点 + 等宽数字 + 语义变化徽章 + 可选微进度条与轻抬反馈。 */
export function MetricCard({
  label,
  value,
  hint,
  delta,
  deltaTone = "neutral",
  icon,
  iconTone = "neutral",
  progressPct,
  interactive = false,
  onClick,
  className,
}: MetricCardProps): React.JSX.Element {
  const clampedPct =
    progressPct === undefined ? undefined : Math.max(0, Math.min(100, progressPct));

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-ink-mid">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-ink-strong">
            {String(value)}
          </p>
        </div>
        {icon !== undefined && (
          <IconBadge size="md" tone={iconTone}>
            {icon}
          </IconBadge>
        )}
      </div>

      {(delta !== undefined || hint !== undefined) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {delta !== undefined ? (
            <Badge tone={deltaTone} dot>
              {delta}
            </Badge>
          ) : (
            <span />
          )}
          {hint !== undefined && <span className="text-xs text-ink-faint">{hint}</span>}
        </div>
      )}

      {clampedPct !== undefined && (
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="animate-bar-in h-full rounded-full bg-ink-strong"
            style={{ width: String(clampedPct) + "%" }}
          />
        </div>
      )}
    </>
  );

  const sharedClass = cn(
    "rounded-2xl border border-line bg-white p-4 text-left shadow-[var(--shadow-card)]",
    (interactive || onClick !== undefined) && "motion-card-lift cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-line-strong",
    className,
  );

  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} className={cn("w-full", sharedClass)}>
        {body}
      </button>
    );
  }

  return <div className={sharedClass}>{body}</div>;
}
