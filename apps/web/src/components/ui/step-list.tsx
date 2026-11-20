import { AlertTriangle, Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepStatus = "idle" | "active" | "done" | "warning" | "error";

export interface StepItem {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
}

/** 轻量确定性步骤条：用于接管预演、真源迁移与 gh 登录轮询等清晰反馈。 */
export function StepList({
  items,
  className,
}: {
  items: readonly StepItem[];
  className?: string;
}): React.JSX.Element {
  return (
    <ol className={cn("space-y-2.5", className)}>
      {items.map((step) => (
        <li key={step.id} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
              step.status === "done" && "border-green-200 bg-green-50 text-green-700",
              step.status === "active" && "border-ink-strong bg-ink-strong text-white",
              step.status === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
              step.status === "error" && "border-red-200 bg-red-50 text-red-700",
              step.status === "idle" && "border-line bg-surface text-ink-faint",
            )}
          >
            {step.status === "done" && <Check className="size-3" aria-hidden />}
            {step.status === "active" && <Loader2 className="size-3 animate-spin" aria-hidden />}
            {step.status === "warning" && <AlertTriangle className="size-3" aria-hidden />}
            {step.status === "error" && <X className="size-3" aria-hidden />}
            {step.status === "idle" && <Circle className="size-2" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm leading-snug",
                step.status === "idle" ? "text-ink-mid" : "font-medium text-ink-strong",
              )}
            >
              {step.title}
            </p>
            {step.detail !== undefined && step.detail !== "" && (
              <p className="mt-0.5 text-xs text-ink-faint">{step.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
