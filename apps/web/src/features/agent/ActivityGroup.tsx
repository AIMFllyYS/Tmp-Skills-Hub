/**
 * 工具活动组(ui-design-v2 §9):连续只读工具合成一行「查阅了 N 项」,进行中显示当前动作。
 */

import { useState } from "react";
import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toolName, toolRunning, type ToolPart } from "./message-blocks.js";
import { ToolIcon } from "./tool-icons.js";
import { failureOf, toolMeta } from "./tool-meta.js";

function rawOf(part: ToolPart): string {
  const value = part.state === "output-available" ? part.output : part.state === "output-error" ? part.errorText : part.input;
  return typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
}

function StatusMark({ part }: { part: ToolPart }): React.JSX.Element {
  if (toolRunning(part)) return <Loader2 className="size-3.5 text-ink-faint motion-safe:animate-spin" aria-label="进行中" />;
  const failed = part.state === "output-error" || part.state === "output-denied" || (part.state === "output-available" && failureOf(part.output) !== "");
  if (failed) return <X className="size-3.5 text-red-600" aria-label="失败" />;
  return <Check className="size-3.5 text-volt" aria-label="完成" />;
}

function ToolRow({ part }: { part: ToolPart }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(toolName(part));
  const input = meta.input(part.input);
  const output = part.state === "output-available" ? meta.output(part.output) : part.state === "output-error" ? part.errorText : "";
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="motion-row grid w-full grid-cols-[1rem_auto_minmax(0,1fr)_auto_1rem] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface"
      >
        <ToolIcon name={meta.icon} className="size-3.5 text-ink-faint" />
        <span className="text-ink-strong">{meta.label}</span>
        <span className="truncate font-mono text-xs text-ink-faint">{input}</span>
        <span className="max-w-48 truncate text-xs text-ink-mid">{output}</span>
        <StatusMark part={part} />
      </button>
      {open && (
        <pre className="mx-2 mt-1 mb-2 max-h-56 overflow-auto rounded-lg border border-line bg-surface p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-mid">
          {rawOf(part)}
        </pre>
      )}
    </li>
  );
}

export function ActivityGroup({ tools }: { tools: ToolPart[] }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const running = tools.find(toolRunning);
  const icons = [...new Set(tools.map((t) => toolMeta(toolName(t)).icon))].slice(0, 4);
  const current = running !== undefined ? toolMeta(toolName(running)) : null;
  return (
    <div className="rounded-xl border border-line bg-surface/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-volt-fill/60"
      >
        <span className="flex -space-x-1">
          {icons.map((ic) => (
            <span key={ic} className="flex size-5 items-center justify-center rounded-md border border-line bg-card text-ink-mid">
              <ToolIcon name={ic} className="size-3" />
            </span>
          ))}
        </span>
        {current !== null && running !== undefined ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="animate-shimmer">正在{current.label}</span>
            <span className="ml-1.5 font-mono text-xs text-ink-faint">{current.input(running.input)}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-ink-mid">
            查阅了 <span className="font-medium text-ink-strong tabular-nums">{tools.length}</span> 项
            <span className="ml-1.5 text-ink-faint">{[...new Set(tools.map((t) => toolMeta(toolName(t)).label))].slice(0, 3).join(" · ")}</span>
          </span>
        )}
        <ChevronRight className={cn("size-3.5 shrink-0 text-ink-faint transition-transform duration-fast ease-smooth", open && "rotate-90")} aria-hidden />
      </button>
      {open && (
        <ul className="border-t border-line px-1 py-1">
          {tools.map((t) => (
            <ToolRow key={t.toolCallId} part={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
