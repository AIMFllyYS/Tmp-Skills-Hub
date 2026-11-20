import { Search, X } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { ICON_STROKE } from "./icon.js";

/** 键盘快捷键胶囊（如 ⌘K / /），克制商务键帽质感。 */
export function Kbd({
  children,
  className,
}: {
  children: string;
  className?: string;
}): React.JSX.Element {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-line bg-canvas px-1.5 font-mono text-[11px] font-medium text-ink-mid shadow-[0_1px_0_rgba(17,19,24,0.06)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  shortcut?: string;
  containerClassName?: string;
  testId?: string;
}

/** 统一商务搜索框：精雕线性放大镜 + 一键清空按钮 + 可选键帽提示。 */
export function SearchInput({
  value,
  onValueChange,
  shortcut,
  placeholder = "搜索…",
  containerClassName,
  className,
  testId,
  disabled,
  ...props
}: SearchInputProps): React.JSX.Element {
  const hasValue = value.length > 0;
  return (
    <div className={cn("relative flex items-center", containerClassName)}>
      <Search
        className="pointer-events-none absolute left-3 size-4 text-ink-faint"
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        disabled={disabled}
        data-testid={testId}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "h-9 w-full rounded-[10px] border border-line bg-white pl-9 text-sm text-ink-strong shadow-[var(--shadow-control)] outline-none motion-fill placeholder:text-ink-faint hover:border-line-strong/80 focus:border-ink-strong/60 focus-visible:ring-1 focus-visible:ring-line-strong disabled:bg-canvas disabled:opacity-55 [&::-webkit-search-cancel-button]:hidden",
          hasValue || shortcut !== undefined ? "pr-9" : "pr-3",
          className,
        )}
        {...props}
      />
      {hasValue ? (
        <button
          type="button"
          aria-label="清空搜索"
          disabled={disabled}
          onClick={() => onValueChange("")}
          className="motion-press absolute right-2 flex size-5 items-center justify-center rounded-md text-ink-faint hover:bg-surface hover:text-ink-strong"
        >
          <X className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      ) : (
        shortcut !== undefined && (
          <span className="pointer-events-none absolute right-2.5">
            <Kbd>{shortcut}</Kbd>
          </span>
        )
      )}
    </div>
  );
}
