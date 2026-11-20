import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", {
  variants: {
    tone: {
      neutral: "bg-surface text-ink-mid",
      success: "bg-green-50 text-green-700",
      warning: "bg-amber-50 text-amber-800",
      danger: "bg-red-50 text-red-700",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
