/** 计划卡(agent-v0.md §8 / ui-design-v2 §9):进度条 + 步骤清单,只显示最新一版。 */

import { Check, ListChecks, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanView } from "./tool-meta.js";

export function PlanCard({ plan }: { plan: PlanView }): React.JSX.Element {
  const done = plan.steps.filter((s) => s.status === "done").length;
  const total = plan.steps.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const finished = done === total;
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card shadow-card" aria-label="计划">
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
        <span className={cn("flex size-6 items-center justify-center rounded-md", finished ? "bg-volt-soft text-volt" : "bg-surface text-ink-mid")}>
          <ListChecks className="size-3.5" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">{plan.title !== "" ? plan.title : "计划"}</p>
        <span className="font-mono text-xs text-ink-faint tabular-nums">
          {done}/{total}
        </span>
      </header>
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
        <div className="h-full rounded-full bg-volt-fill transition-[width] duration-slow ease-smooth" style={{ width: String(pct) + "%" }} />
      </div>
      <ol className="space-y-0.5 px-2 py-2.5">
        {plan.steps.map((step, i) => (
          <li
            key={String(i) + step.title}
            className={cn("flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px]", step.status === "in_progress" && "bg-surface")}
          >
            <span className="mt-px flex size-4 shrink-0 items-center justify-center">
              {step.status === "done" && (
                <span className="flex size-4 items-center justify-center rounded-full bg-volt-fill text-volt-ink ring-1 ring-volt/30">
                  <Check className="size-2.5" strokeWidth={3} aria-hidden />
                </span>
              )}
              {step.status === "in_progress" && <Loader2 className="size-3.5 text-volt motion-safe:animate-spin" aria-hidden />}
              {step.status === "pending" && <span className="size-3.5 rounded-full border-[1.5px] border-line-strong" aria-hidden />}
            </span>
            <span
              className={cn(
                "min-w-0 leading-snug",
                step.status === "done" && "text-ink-faint",
                step.status === "in_progress" && "font-medium text-ink-strong",
                step.status === "pending" && "text-ink-mid",
              )}
            >
              {step.title}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
