import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_STROKE } from "./icon.js";

export type StepStatus = "idle" | "active" | "done" | "warning" | "error";

export interface StepItem {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
}

/** 轻量确定性步骤条：纵向连接线 + 编号/状态圆核，用于接管预演、真源迁移与 gh 登录轮询。 */
export function StepList({
  items,
  className,
}: {
  items: readonly StepItem[];
  className?: string;
}): React.JSX.Element {
  return (
    <ol className={cn("space-y-3", className)}>
      {items.map((step, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={step.id} className="relative flex items-start gap-3 text-sm">
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-6 bottom-[-14px] left-[11px] w-px",
                  step.status === "done" ? "bg-emerald-300" : "bg-line",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums shadow-[var(--shadow-control)]",
                step.status === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                step.status === "active" && "border-ink-strong bg-ink-strong text-white",
                step.status === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
                step.status === "error" && "border-red-200 bg-red-50 text-red-700",
                step.status === "idle" && "border-line bg-white text-ink-faint",
              )}
            >
              {step.status === "done" && <Check className="size-3.5" strokeWidth={2} aria-hidden />}
              {step.status === "active" && (
                <Loader2 className="size-3.5 motion-safe:animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
              )}
              {step.status === "warning" && <AlertTriangle className="size-3" strokeWidth={ICON_STROKE} aria-hidden />}
              {step.status === "error" && <X className="size-3.5" strokeWidth={2} aria-hidden />}
              {step.status === "idle" && <span>{String(index + 1)}</span>}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-sm leading-snug",
                  step.status === "idle" ? "text-ink-mid" : "font-medium text-ink-strong",
                )}
              >
                {step.title}
              </p>
              {step.detail !== undefined && step.detail !== "" && (
                <p className="mt-0.5 font-mono text-xs leading-relaxed text-ink-faint">{step.detail}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
