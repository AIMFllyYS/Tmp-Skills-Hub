import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-card px-1 font-mono text-[10px] text-ink-faint shadow-[0_1px_0_var(--color-line)]",
        className,
      )}
      {...props}
    />
  );
}
