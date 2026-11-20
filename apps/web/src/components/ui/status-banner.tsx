import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button.js";
import { ICON_STROKE } from "./icon.js";

const bannerVariants = cva(
  "motion-enter flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-sm",
  {
    variants: {
      tone: {
        neutral: "border-line bg-canvas text-ink-strong",
        info: "border-slate-200/90 bg-accent-soft/85 text-accent-ink",
        warning: "border-amber-200/90 bg-amber-50/90 text-amber-900",
        danger: "border-red-200/90 bg-red-50/90 text-red-800",
        success: "border-emerald-200/90 bg-emerald-50/85 text-emerald-900",
      },
      surface: {
        bar: "rounded-none border-x-0 border-t-0",
        card: "rounded-xl border px-4 py-3 shadow-[var(--shadow-control)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
      surface: "bar",
    },
  },
);

const TONE_ICON = {
  neutral: Info,
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle2,
} as const;

const TONE_ICON_CHIP = {
  neutral: "border-line bg-white text-ink-mid",
  info: "border-slate-200 bg-white text-accent-ink",
  warning: "border-amber-200 bg-white text-amber-700",
  danger: "border-red-200 bg-white text-red-700",
  success: "border-emerald-200 bg-white text-emerald-700",
} as const;

export interface StatusBannerProps extends VariantProps<typeof bannerVariants> {
  title: string;
  description?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  testId?: string;
}

/** 统一状态提醒横幅（顶栏横条或卡片内联警示），采用精雕图标锚点 + 克制浅底深字。 */
export function StatusBanner({
  tone = "neutral",
  surface = "bar",
  title,
  description,
  action,
  onDismiss,
  className,
  testId,
}: StatusBannerProps): React.JSX.Element {
  const resolvedTone = tone ?? "neutral";
  const Icon = TONE_ICON[resolvedTone];
  return (
    <div
      role={resolvedTone === "danger" || resolvedTone === "warning" ? "alert" : "status"}
      data-testid={testId}
      className={cn(bannerVariants({ tone: resolvedTone, surface }), className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] border shadow-[var(--shadow-control)]",
            TONE_ICON_CHIP[resolvedTone],
          )}
          aria-hidden
        >
          <Icon className="size-3.5" strokeWidth={ICON_STROKE} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{title}</p>
          {description !== undefined && description !== "" && (
            <p className="mt-0.5 text-xs leading-relaxed opacity-85">{description}</p>
          )}
        </div>
      </div>
      {(action !== undefined || onDismiss !== undefined) && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {onDismiss !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="暂时收起"
              onClick={onDismiss}
              className="size-7"
            >
              <X className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
