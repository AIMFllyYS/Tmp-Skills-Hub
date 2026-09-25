import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const TONE = {
  default: "bg-surface-strong/70 text-ink-mid",
  outline: "border border-line bg-card text-ink-mid",
  volt: "border border-volt-line/70 bg-volt-soft text-volt",
  warn: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
} as const;

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }): React.JSX.Element {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap", TONE[tone], className)}
      {...props}
    />
  );
}
