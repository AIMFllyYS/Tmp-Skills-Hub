import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn("text-xs font-medium tracking-wide text-ink-faint", className)} {...props} />;
}

export function CardValue({ className, ...props }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return (
    <p
      className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink-strong", className)}
      {...props}
    />
  );
}
