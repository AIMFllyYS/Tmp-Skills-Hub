import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-tight",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface text-ink-mid",
        slate: "border-slate-200/90 bg-accent-soft text-accent-ink",
        success: "border-emerald-200/90 bg-emerald-50/85 text-emerald-800",
        warning: "border-amber-200/90 bg-amber-50/90 text-amber-800",
        danger: "border-red-200/90 bg-red-50/90 text-red-700",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

const DOT_TONE = {
  neutral: "bg-ink-faint",
  slate: "bg-accent-ink",
  success: "bg-emerald-600",
  warning: "bg-amber-600",
  danger: "bg-red-600",
} as const;

export function Badge({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    dot?: boolean;
  }): React.JSX.Element {
  const resolvedTone = tone ?? "neutral";
  return (
    <span className={cn(badgeVariants({ tone: resolvedTone }), className)} {...props}>
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE[resolvedTone])} aria-hidden />}
      {children}
    </span>
  );
}
