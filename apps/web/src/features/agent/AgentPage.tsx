/**
 * Agent 页(ui-design-v2 §9):页头写策略 + 新会话;中间对话列;底部输入区。
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { fetchAgentModels } from "./api.js";
import { AssistantMessage } from "./AssistantMessage.js";
import { Composer } from "./Composer.js";
import { EmptyState } from "./EmptyState.js";
import { plainTextOf } from "./message-blocks.js";
import type { AgentModel, WritePolicy } from "./types.js";
import { useAgentChat } from "./useAgentChat.js";
import { useStickToBottom } from "./use-stick-to-bottom.js";

const POLICY_ITEMS = [
  { id: "ask" as const, label: "先批准" },
  { id: "allow" as const, label: "全部允许" },
];

/** 服务端错误常是 JSON 信封({ ok:false, code, message }),只取人话。 */
export function friendlyError(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message !== "") return parsed.message;
    } catch {
      // 不是 JSON,原样返回
    }
  }
  return trimmed === "" ? "请求失败" : trimmed;
}

export function AgentPage(): React.JSX.Element {
  const chat = useAgentChat();
  const { messages, busy, errorText, applyModelDefault } = chat;
  const [models, setModels] = useState<AgentModel[]>([]);
  const [input, setInput] = useState("");
  const { ref: scrollRef, atBottom, scrollToBottom } = useStickToBottom([messages, errorText]);

  useEffect(() => {
    let cancelled = false;
    void fetchAgentModels()
      .then((res) => {
        if (cancelled) return;
        setModels(res.models);
        applyModelDefault(
          res.defaultModel,
          res.models.map((m) => m.id),
        );
      })
      .catch((e) => {
        if (!cancelled) toast.error("模型列表加载失败: " + (e instanceof Error ? e.message : String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [applyModelDefault]);

  const modelLabel = useCallback((id: string) => models.find((m) => m.id === id)?.label ?? id, [models]);

  const submit = (): void => {
    if (input.trim() === "" || busy) return;
    chat.send(input);
    setInput("");
    scrollToBottom();
  };

  const onPolicyChange = (next: WritePolicy): void => {
    chat.setWritePolicy(next);
    if (next === "allow") toast.message("写操作将不再逐条确认");
  };

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-volt-soft text-volt ring-1 ring-volt-line/60">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-ink-strong">Agent</h1>
            <p className="truncate text-xs text-ink-faint">库存管家 · 先查证、再计划、每步可见</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-ink-faint md:inline">写操作</span>
          <SegmentedTabs size="sm" ariaLabel="写策略" value={chat.writePolicy} onChange={onPolicyChange} items={POLICY_ITEMS} />
          <Button type="button" variant="ghost" size="sm" onClick={chat.reset} disabled={messages.length === 0 && errorText === null}>
            <Plus className="size-3.5" aria-hidden />
            新会话
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pt-8 pb-10">
            {messages.length === 0 && errorText === null ? (
              <EmptyState onPick={(p) => chat.send(p)} />
            ) : (
              <div className="space-y-8">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-strong/80 px-4 py-2.5 text-[14.5px] leading-6 whitespace-pre-wrap text-ink-strong">
                        {plainTextOf(message.parts)}
                      </p>
                    </div>
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      streaming={busy && message.id === lastId}
                      modelLabel={modelLabel}
                      onApprove={chat.approve}
                      onDeny={chat.deny}
                    />
                  ),
                )}
                {chat.submitted && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-3.5">
                    <span className="size-7 shrink-0 rounded-lg border border-line bg-card" aria-hidden />
                    <p className="animate-shimmer text-[13px]">正在思考…</p>
                  </div>
                )}
                {errorText !== null && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3" role="alert">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-red-800">这一轮没有完成</p>
                      <p className="mt-0.5 text-[13px] break-words text-red-700">{friendlyError(errorText)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={chat.retry}>
                        <RotateCcw className="size-3.5" aria-hidden />
                        重试
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label="关闭" onClick={chat.dismissError}>
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {!atBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-ink-mid shadow-pop outline-none motion-press hover:text-ink-strong focus-visible:ring-2 focus-visible:ring-volt-fill/60"
          >
            <ArrowDown className="size-3.5" aria-hidden />
            回到底部
          </button>
        )}
      </div>

      <div className="shrink-0 px-6 pb-5">
        <div className="mx-auto max-w-3xl">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={submit}
            onStop={chat.stop}
            busy={busy}
            thinking={chat.thinking}
            onThinking={chat.setThinking}
            models={models}
            model={chat.model}
            onModel={chat.setModel}
          />
          <p className="mt-2 text-center text-[11px] text-ink-faint">
            会话只存在本机浏览器;写策略「{chat.writePolicy === "ask" ? "先批准" : "全部允许"}」。
          </p>
        </div>
      </div>
    </div>
  );
}
