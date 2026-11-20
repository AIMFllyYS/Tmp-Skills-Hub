import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Label } from "./label.js";
import { Tooltip, TruncateTip } from "./tooltip.js";

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

/** 只读等宽路径字段：截断 + Tooltip 全文 + 一键复制反馈 + 可选操作槽。 */
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
  const [copied, setCopied] = useState(false);
  const empty = path.trim() === "";

  const handleCopy = (): void => {
    if (empty) return;
    void navigator.clipboard.writeText(path).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => {
        onCopyError?.();
      },
    );
  };

  return (
    <div className={cn("space-y-1.5", className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          {tag !== undefined && tag !== "" && <Badge>{tag}</Badge>}
        </div>
        {hint !== undefined && hint !== "" && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
        <TruncateTip
          text={empty ? "未配置" : path}
          className="min-w-0 flex-1 font-mono text-xs text-ink-strong"
        />
        <Tooltip label={copied ? "已复制" : "复制路径"} side="top" disabled={empty}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={"复制" + label}
            disabled={empty}
            onClick={handleCopy}
            className="size-7 shrink-0 bg-white"
          >
            {copied ? (
              <Check className="size-3.5 text-green-700" aria-hidden />
            ) : (
              <Copy className="size-3.5 text-ink-mid" aria-hidden />
            )}
          </Button>
        </Tooltip>
        {trailing}
      </div>
    </div>
  );
}
