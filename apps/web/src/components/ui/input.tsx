import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-9 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink-strong shadow-card outline-none motion-fill placeholder:text-ink-faint hover:border-line-strong focus:border-volt-line focus-visible:ring-2 focus-visible:ring-volt-fill/40 disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function NativeSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={cn(fieldClass, className)} {...props} />;
}
