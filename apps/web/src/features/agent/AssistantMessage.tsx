/**
 * 一条助手消息:按 buildBlocks 的顺序渲染 思考 / 计划 / 工具活动 / 写操作 / 正文,底部元信息。
 */

import { memo, useState } from "react";
import { Brain, Check, Copy } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { renderMarkdown } from "@/lib/markdown.js";
import { cn } from "@/lib/utils";
import { ActivityGroup } from "./ActivityGroup.js";
import { buildBlocks, plainTextOf, toolAwaitingApproval, toolRunning, type Block } from "./message-blocks.js";
import { PlanCard } from "./PlanCard.js";
import { ReasoningBlock } from "./ReasoningBlock.js";
import type { AgentMetadata, AgentUIMessage } from "./types.js";
import { WriteToolCard } from "./WriteToolCard.js";

function formatTokens(n: number): string {
  return n >= 10_000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

function MetaLine({ meta, modelLabel }: { meta: AgentMetadata | undefined; modelLabel: (id: string) => string }): React.JSX.Element | null {
  if (meta === undefined) return null;
  const bits: string[] = [];
  if (meta.model !== undefined) bits.push(modelLabel(meta.model));
  const total = meta.usage?.totalTokens ?? ((meta.usage?.inputTokens ?? 0) + (meta.usage?.outputTokens ?? 0) || undefined);
  if (total !== undefined) bits.push(formatTokens(total) + " tokens");
  if (bits.length === 0 && meta.thinking !== true) return null;
  return (
    <span className="flex items-center gap-1.5">
      {meta.thinking === true && (
        <span className="flex items-center gap-1 text-volt">
          <Brain className="size-3" aria-hidden />
          深度思考
        </span>
      )}
      {meta.thinking === true && bits.length > 0 && <span aria-hidden>·</span>}
      <span className="font-mono">{bits.join(" · ")}</span>
    </span>
  );
}

/** 流里还没有可见内容、或卡在两步之间时的状态行。 */
function liveLabel(blocks: Block[]): string | null {
  const last = blocks[blocks.length - 1];
  if (last === undefined) return "正在思考…";
  if (last.kind === "text" || last.kind === "reasoning") return null;
  if (last.kind === "activity" && last.tools.some(toolRunning)) return null;
  if (last.kind === "write" && (toolRunning(last.tool) || toolAwaitingApproval(last.tool))) return null;
  return "继续处理中…";
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  streaming,
  modelLabel,
  onApprove,
  onDeny,
}: {
  message: AgentUIMessage;
  streaming: boolean;
  modelLabel: (id: string) => string;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const blocks = buildBlocks(message.parts);
  const live = streaming ? liveLabel(blocks) : null;
  const text = plainTextOf(message.parts);

  const copy = (): void => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <article className="group/msg flex gap-3.5" aria-label="Agent 回复">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-card shadow-card">
        <Logo className="size-4" title="Agent" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {blocks.map((b) => {
          const key = message.id + "-" + b.key;
          switch (b.kind) {
            case "reasoning":
              return <ReasoningBlock key={key} id={key} text={b.text} streaming={streaming && b.streaming} />;
            case "plan":
              return <PlanCard key={key} plan={b.plan} />;
            case "activity":
              return <ActivityGroup key={key} tools={b.tools} />;
            case "write":
              return <WriteToolCard key={key} part={b.tool} onApprove={onApprove} onDeny={onDeny} />;
            case "text":
              return (
                <div
                  key={key}
                  className={cn("skill-md agent-md text-[14.5px] leading-7", streaming && b.streaming && "is-streaming")}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(b.text) }}
                />
              );
          }
        })}
        {live !== null && <p className="animate-shimmer text-[13px]">{live}</p>}
        {!streaming && (
          <footer className="flex h-6 items-center gap-2 text-[11px] text-ink-faint">
            <MetaLine meta={message.metadata} modelLabel={modelLabel} />
            {text !== "" && (
              <Tooltip label={copied ? "已复制" : "复制正文"} side="top">
                <button
                  type="button"
                  onClick={copy}
                  aria-label="复制正文"
                  className={cn(
                    "ml-auto flex size-6 items-center justify-center rounded-md text-ink-faint outline-none motion-fill hover:bg-surface hover:text-ink-mid focus-visible:ring-2 focus-visible:ring-volt-fill/60",
                    "opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100",
                    copied && "opacity-100",
                  )}
                >
                  {copied ? <Check className="size-3.5 text-volt" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                </button>
              </Tooltip>
            )}
          </footer>
        )}
      </div>
    </article>
  );
});
