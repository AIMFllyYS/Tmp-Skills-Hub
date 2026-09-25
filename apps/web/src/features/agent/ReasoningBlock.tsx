/**
 * 思考块(ui-design-v2 §9):流式时展开并扫光,结束后自动收起,标题显示用时。
 * 用时只在本页会话内测得;刷新后的历史消息只显示「思考过程」。
 */

import { useEffect, useRef, useState } from "react";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const durations = new Map<string, number>();

export function ReasoningBlock({ id, text, streaming }: { id: string; text: string; streaming: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(streaming);
  const touched = useRef(false);
  const startedAt = useRef<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(() => durations.get(id) ?? null);

  useEffect(() => {
    if (streaming) {
      if (startedAt.current === null) startedAt.current = Date.now();
      if (!touched.current) setOpen(true);
      return;
    }
    if (startedAt.current !== null && !durations.has(id)) {
      const s = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      durations.set(id, s);
      setSeconds(s);
    }
    if (!touched.current) setOpen(false);
  }, [streaming, id]);

  const label = streaming ? "思考中…" : seconds !== null ? "已思考 " + String(seconds) + " 秒" : "思考过程";

  return (
    <div className="group/reason">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          touched.current = true;
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 rounded-md py-0.5 pr-1 text-[13px] text-ink-faint outline-none motion-fill hover:text-ink-mid focus-visible:ring-2 focus-visible:ring-volt-fill/60"
      >
        <Brain className={cn("size-3.5", streaming && "text-volt")} aria-hidden />
        <span className={cn(streaming && "animate-shimmer")}>{label}</span>
        <ChevronRight className={cn("size-3.5 transition-transform duration-fast ease-smooth", open && "rotate-90")} aria-hidden />
      </button>
      {open && text.trim() !== "" && (
        <div className="mt-1.5 ml-[7px] max-h-80 overflow-y-auto border-l-2 border-line pl-3.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-mid">
          {text}
          {streaming && <span className="animate-caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-ink-faint" aria-hidden />}
        </div>
      )}
    </div>
  );
}
