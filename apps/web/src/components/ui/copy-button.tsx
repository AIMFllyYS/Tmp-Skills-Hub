import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button.js";
import { ICON_STROKE } from "./icon.js";
import { Tooltip } from "./tooltip.js";

export interface CopyButtonProps {
  value: string;
  label?: string;
  copiedLabel?: string;
  ariaLabel?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  onError?: () => void;
  className?: string;
}

/** 统一商务复制按钮：图标平滑切换至翡翠绿勾 + Tooltip 即时反馈。 */
export function CopyButton({
  value,
  label = "复制",
  copiedLabel = "已复制",
  ariaLabel,
  iconOnly = false,
  disabled = false,
  onError,
  className,
}: CopyButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const empty = value.trim() === "" || disabled;

  const handleCopy = (): void => {
    if (empty || typeof navigator === "undefined" || navigator.clipboard === undefined) return;
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => onError?.(),
    );
  };

  const btn = (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      disabled={empty}
      aria-label={ariaLabel ?? (copied ? copiedLabel : label)}
      onClick={handleCopy}
      className={cn(iconOnly && "size-7 shrink-0 bg-white", className)}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-700" strokeWidth={ICON_STROKE + 0.3} aria-hidden />
      ) : (
        <Copy className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
      )}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </Button>
  );

  if (iconOnly) {
    return (
      <Tooltip label={copied ? copiedLabel : label} side="top" disabled={empty}>
        {btn}
      </Tooltip>
    );
  }
  return btn;
}
