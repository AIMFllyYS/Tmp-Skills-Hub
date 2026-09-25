/**
 * 输入区(ui-design-v2 §9):圆角卡片内自适应文本框 + 工具条(深度思考、模型、发送 / 停止)。
 */

import { useEffect, useRef } from "react";
import { ArrowUp, Brain, Check, ChevronDown, Square } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentModel } from "./types.js";

const MAX_ROWS_PX = 8 * 24;

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  thinking,
  onThinking,
  models,
  model,
  onModel,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  thinking: boolean;
  onThinking: (on: boolean) => void;
  models: AgentModel[];
  model: string;
  onModel: (id: string) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const current = models.find((m) => m.id === model);
  const thinkingAvailable = current?.thinking !== false;
  const thinkingOn = thinking && thinkingAvailable;

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = String(Math.min(el.scrollHeight, MAX_ROWS_PX)) + "px";
  }, [value]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-card shadow-lift motion-fill focus-within:border-volt-line focus-within:ring-4 focus-within:ring-volt-soft">
      <textarea
        ref={ref}
        data-testid="agent-input"
        rows={1}
        value={value}
        placeholder="问问你的库存,比如「把前端相关的 skill 都启用到 Cursor」"
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
            ev.preventDefault();
            onSubmit();
          }
        }}
        className="block max-h-48 min-h-[3.25rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[14.5px] leading-6 text-ink-strong outline-none placeholder:text-ink-faint"
      />
      <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-2.5">
        <Tooltip label={thinkingAvailable ? "打开后模型先思考再回答,更慢但更稳" : "当前模型不支持深度思考"} side="top">
          <button
            type="button"
            aria-pressed={thinkingOn}
            disabled={!thinkingAvailable}
            onClick={() => onThinking(!thinking)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs outline-none motion-press focus-visible:ring-2 focus-visible:ring-volt-fill/60 disabled:opacity-40",
              thinkingOn ? "border-volt-line bg-volt-soft text-volt" : "border-line text-ink-mid hover:bg-surface hover:text-ink-strong",
            )}
          >
            <Brain className="size-3.5" aria-hidden />
            深度思考
          </button>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="选择模型"
            className="flex h-7 max-w-52 items-center gap-1 rounded-full px-2.5 text-xs text-ink-mid outline-none motion-fill hover:bg-surface hover:text-ink-strong focus-visible:ring-2 focus-visible:ring-volt-fill/60"
          >
            <span className="truncate">{current?.label ?? "选择模型"}</span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72">
            {models.map((m) => (
              <DropdownMenuItem key={m.id} onClick={() => onModel(m.id)} className="items-start py-2">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                  {m.id === model && <Check className="size-3.5 text-volt" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm text-ink-strong">
                    {m.label}
                    {m.thinking !== false && <Brain className="size-3 text-ink-faint" aria-label="支持深度思考" />}
                  </span>
                  <span className="block text-xs text-ink-faint">{m.note}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-auto hidden items-center gap-1 text-[11px] text-ink-faint sm:flex">
          <Kbd>Enter</Kbd> 发送 <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> 换行
        </span>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="停止"
            className={cn(buttonVariants({ variant: "outline", size: "icon" }), "ml-2 rounded-full")}
          >
            <Square className="size-3 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            data-testid="agent-send"
            aria-label="发送"
            disabled={value.trim() === ""}
            onClick={onSubmit}
            className={cn(buttonVariants({ variant: "accent", size: "icon" }), "ml-2 rounded-full")}
          >
            <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
