import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      className={cn(
        "w-full rounded-[10px] border border-line bg-white p-3 font-mono text-xs text-ink-strong shadow-[var(--shadow-control)] outline-none motion-fill placeholder:text-ink-faint hover:border-line-strong/80 focus:border-ink-strong/60 focus-visible:ring-1 focus-visible:ring-line-strong disabled:bg-canvas disabled:opacity-55",
        className,
      )}
      {...props}
    />
  );
}
