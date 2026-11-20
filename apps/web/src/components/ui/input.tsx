import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-9 w-full rounded-[10px] border border-line bg-white px-3 text-sm text-ink-strong shadow-[var(--shadow-control)] outline-none motion-fill placeholder:text-ink-faint hover:border-line-strong/80 focus:border-ink-strong/60 focus-visible:ring-1 focus-visible:ring-line-strong disabled:bg-canvas disabled:opacity-55";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function NativeSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={cn(fieldClass, className)} {...props} />;
}
