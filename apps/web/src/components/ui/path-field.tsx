import { Folder } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge.js";
import { CopyButton } from "./copy-button.js";
import { ICON_STROKE } from "./icon.js";
import { Label } from "./label.js";
import { TruncateTip } from "./tooltip.js";

export interface PathFieldProps {
  label: string;
  path: string;
  tag?: string;
  hint?: string;
  trailing?: ReactNode;
  onCopyError?: () => void;
  className?: string;
  testId?: string;
}

/** 只读等宽路径字段：截断 + Tooltip 全文 + 统一 CopyButton + 可选操作槽。 */
export function PathField({
  label,
  path,
  tag,
  hint,
  trailing,
  onCopyError,
  className,
  testId,
}: PathFieldProps): React.JSX.Element {
  const empty = path.trim() === "";

  return (
    <div className={cn("space-y-1.5", className)} data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          {tag !== undefined && tag !== "" && <Badge tone="slate">{tag}</Badge>}
        </div>
        {hint !== undefined && hint !== "" && (
          <span className="font-mono text-xs text-ink-faint">{hint}</span>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
        <Folder className="size-3.5 shrink-0 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
        <TruncateTip
          text={empty ? "未配置" : path}
          className="min-w-0 flex-1 font-mono text-xs text-ink-strong"
        />
        <CopyButton
          value={path}
          iconOnly
          disabled={empty}
          label="复制路径"
          copiedLabel="已复制"
          ariaLabel={"复制" + label}
          {...(onCopyError !== undefined ? { onError: onCopyError } : {})}
        />
        {trailing}
      </div>
    </div>
  );
}
