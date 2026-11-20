import { useCallback, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { stepTabIndex } from "./tabs-step.js";

export { stepTabIndex } from "./tabs-step.js";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  testId?: string;
  badge?: number;
}

/** 分段胶囊控制器：同心圆角（外槽 10px / 内块 7px）+ 浅石膏槽 + 白底微高度选中块。 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  size = "default",
  disabled = false,
}: {
  value: T;
  onChange: (id: T) => void;
  items: readonly SegmentedTabItem<T>[];
  ariaLabel: string;
  size?: "default" | "sm";
  disabled?: boolean;
}): React.JSX.Element {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      const item = items[stepTabIndex(items.findIndex((it) => it.id === value), e.key, items.length)];
      if (item === undefined) return;
      e.preventDefault();
      onChange(item.id);
      const i = items.findIndex((it) => it.id === item.id);
      if (i >= 0) buttons.current[i]?.focus();
    },
    [disabled, items, onChange, value],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="inline-flex rounded-[10px] border border-line/80 bg-surface p-0.5"
    >
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            data-testid={item.testId}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center rounded-[7px] outline-none motion-press",
              "focus-visible:ring-1 focus-visible:ring-line-strong",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              active
                ? "bg-white font-medium text-ink-strong shadow-[var(--shadow-thumb)]"
                : "text-ink-mid hover:text-ink-strong",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className={cn(
                  "ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
                  active
                    ? "bg-ink-strong text-white"
                    : "border border-amber-200 bg-amber-50 text-amber-800",
                )}
              >
                {String(item.badge)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
