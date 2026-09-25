import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-card p-2.5 font-mono text-xs text-ink-strong outline-none motion-fill placeholder:text-ink-faint hover:border-line-strong focus:border-volt-line focus-visible:ring-2 focus-visible:ring-volt-fill/40",
        className,
      )}
      {...props}
    />
  );
}
