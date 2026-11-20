import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button.js";

const bannerVariants = cva(
  "motion-enter flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 text-sm",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface text-ink-strong",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        danger: "border-red-200 bg-red-50 text-red-700",
        success: "border-green-200 bg-green-50 text-green-700",
      },
      surface: {
        bar: "rounded-none border-x-0 border-t-0",
        card: "rounded-xl border px-4 py-3",
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
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle2,
} as const;

export interface StatusBannerProps extends VariantProps<typeof bannerVariants> {
  title: string;
  description?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  testId?: string;
}

/** 统一状态提醒横幅（顶栏横条或卡片内联警示），遵循 ui-design-v1 三档语义浅底深字。 */
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
  const Icon = TONE_ICON[tone ?? "neutral"];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      data-testid={testId}
      className={cn(bannerVariants({ tone, surface }), className)}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{title}</p>
          {description !== undefined && description !== "" && (
            <p className="mt-0.5 text-xs opacity-90">{description}</p>
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
              <X className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
