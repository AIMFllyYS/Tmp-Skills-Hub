import { cn } from "@/lib/utils";

export function tabTriggerClass(active: boolean): string {
  return cn(
    "inline-flex items-center border-b px-3 py-2 text-sm transition-[color,border-color,transform] duration-[150ms] active:scale-[0.98] motion-reduce:active:scale-100",
    active ? "border-ink-strong text-ink-strong" : "border-transparent text-ink-mid hover:text-ink-strong",
  );
}
