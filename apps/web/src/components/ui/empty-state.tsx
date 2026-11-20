import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconBadge } from "./icon.js";

export interface EmptyStateProps {
  icon: ReactNode;
  iconTone?: "neutral" | "surface" | "slate" | "success" | "warning";
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  testId?: string;
}

/** 统一商务空状态卡片：严格遵循 ui-design-v1 §9.3「空状态必须清晰说明并附带主动作」。 */
export function EmptyState({
  icon,
  iconTone = "neutral",
  title,
  description,
  action,
  secondaryAction,
  className,
  testId,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      className={cn(
        "motion-enter flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong/75 bg-canvas/70 px-6 py-10 text-center",
        className,
      )}
    >
      <IconBadge size="lg" tone={iconTone}>
        {icon}
      </IconBadge>
      <h3 className="mt-4 text-sm font-semibold tracking-tight text-ink-strong">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-mid">{description}</p>
      {(action !== undefined || secondaryAction !== undefined) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
