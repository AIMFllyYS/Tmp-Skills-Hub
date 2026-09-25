/**
 * 写操作卡(ui-design-v2 §9):不并入活动组;ask 下待批准时是审批卡。
 */

import { useState } from "react";
import { ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toolAwaitingApproval, toolName, toolRunning, type ToolPart } from "./message-blocks.js";
import { ToolIcon } from "./tool-icons.js";
import { failureOf, toolMeta } from "./tool-meta.js";

function statusOf(part: ToolPart): { text: string; tone: "default" | "volt" | "warn" | "danger" } {
  if (toolAwaitingApproval(part)) return { text: "待批准", tone: "warn" };
  if (toolRunning(part)) return { text: "执行中", tone: "default" };
  if (part.state === "output-denied") return { text: "已拒绝", tone: "danger" };
  if (part.state === "output-error") return { text: "失败", tone: "danger" };
  if (part.state === "output-available") return failureOf(part.output) !== "" ? { text: "失败", tone: "danger" } : { text: "已完成", tone: "volt" };
  return { text: "准备中", tone: "default" };
}

export function WriteToolCard({
  part,
  onApprove,
  onDeny,
}: {
  part: ToolPart;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}): React.JSX.Element {
  const [showRaw, setShowRaw] = useState(false);
  const meta = toolMeta(toolName(part));
  const approvalId = part.state === "approval-requested" ? part.approval.id : null;
  const waiting = approvalId !== null && toolAwaitingApproval(part);
  const status = statusOf(part);
  const intent = meta.intent?.(part.input) ?? meta.input(part.input);
  const result = part.state === "output-available" ? (failureOf(part.output) || meta.output(part.output)) : part.state === "output-error" ? part.errorText : "";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-card motion-fill",
        waiting ? "border-volt-line ring-4 ring-volt-soft" : "border-line",
      )}
      aria-label={meta.label}
    >
      <header className="flex items-center gap-2.5 px-4 pt-3.5">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", status.tone === "volt" ? "bg-volt-soft text-volt" : "bg-surface text-ink-mid")}>
          {toolRunning(part) ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden /> : <ToolIcon name={meta.icon} className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-strong">{meta.label}</p>
          <p className="text-[11px] text-ink-faint">写操作</p>
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </header>
      <div className="px-4 pt-2.5 pb-3.5">
        <p className="text-[13px] leading-relaxed text-ink-strong">{intent}</p>
        {result !== "" && (
          <p className={cn("mt-1.5 text-xs", status.tone === "danger" ? "text-red-700" : "text-ink-mid")}>{result}</p>
        )}
        {waiting && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="accent" onClick={() => approvalId !== null && onApprove(approvalId)}>
              批准执行
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => approvalId !== null && onDeny(approvalId)}>
              拒绝
            </Button>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-faint">
              <ShieldAlert className="size-3.5" aria-hidden />
              写策略:先批准
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="mt-2.5 flex items-center gap-1 text-[11px] text-ink-faint outline-none hover:text-ink-mid focus-visible:ring-2 focus-visible:ring-volt-fill/60"
          aria-expanded={showRaw}
        >
          <ChevronRight className={cn("size-3 transition-transform duration-fast", showRaw && "rotate-90")} aria-hidden />
          参数与结果
        </button>
        {showRaw && (
          <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-mid">
            {JSON.stringify({ input: part.input, output: part.state === "output-available" ? part.output : undefined }, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
