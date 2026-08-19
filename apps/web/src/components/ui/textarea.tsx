import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-white p-2 font-mono text-xs text-ink-strong outline-none transition-colors duration-[150ms] placeholder:text-ink-faint focus:border-line-strong",
        className,
      )}
      {...props}
    />
  );
}
