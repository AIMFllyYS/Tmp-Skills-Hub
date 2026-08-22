/**
 * 工具调用卡片(agent-v0.md §4 的前端渲染契约):
 * 运行中 spinner / 成功绿点+耗时 / 失败红点;输出折叠在 details 里。
 */

import { Loader2, Wrench } from "lucide-react";
import type { ChatEntry } from "./types.js";

type ToolEntry = Extract<ChatEntry, { kind: "tool" }>;

const ARGS_PREVIEW_LIMIT = 120;

export function ToolCallCard({ entry }: { entry: ToolEntry }): React.JSX.Element {
  const argsPreview = entry.args.length > ARGS_PREVIEW_LIMIT ? entry.args.slice(0, ARGS_PREVIEW_LIMIT) + "…" : entry.args;
  return (
    <div className="motion-row rounded-xl border border-line px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Wrench className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        <span className="shrink-0 font-mono text-xs text-ink-strong">{entry.name}</span>
        <span className="min-w-0 truncate font-mono text-xs text-ink-faint">{argsPreview}</span>
        <span className="ml-auto shrink-0">
          {entry.status === "running" && (
            <span className="flex items-center gap-1 text-xs text-ink-mid">
              <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
              运行中
            </span>
          )}
          {entry.status === "ok" && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden />
              {entry.durationMs !== null ? entry.durationMs + "ms" : "完成"}
            </span>
          )}
          {entry.status === "error" && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <span className="size-1.5 rounded-full bg-red-600" aria-hidden />
              失败
            </span>
          )}
        </span>
      </div>
      {(entry.status !== "running" || entry.output !== "") && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-ink-faint">输出</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-xs text-ink-mid">
            {entry.output}
          </pre>
        </details>
      )}
    </div>
  );
}
