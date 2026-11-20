import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconBadge } from "./icon.js";

/** 分组设置卡容器：同心圆角 16px + 发丝分割线，呈现高级桌面客户端设置区质感。 */
export function SettingGroup({
  title,
  badge,
  children,
  className,
}: {
  title?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("space-y-2.5", className)}>
      {(title !== undefined || badge !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          {title !== undefined && (
            <p className="text-xs font-medium tracking-wide text-ink-mid">{title}</p>
          )}
          {badge}
        </div>
      )}
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
        {children}
      </div>
    </div>
  );
}

export interface SettingRowProps {
  icon?: ReactNode;
  iconTone?: "neutral" | "surface" | "slate" | "success" | "warning" | "danger";
  title: string;
  tag?: ReactNode;
  description?: string;
  control?: ReactNode;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

/** 统一设置行 / 操作行：左侧图标锚点 + 标题徽章 + 描述 + 右侧控件槽。 */
export function SettingRow({
  icon,
  iconTone = "surface",
  title,
  tag,
  description,
  control,
  disabled = false,
  className,
  testId,
}: SettingRowProps): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 motion-fill hover:bg-canvas/55",
        disabled && "opacity-60 hover:bg-white",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon !== undefined && (
          <IconBadge size="sm" tone={iconTone} className="mt-0.5">
            {icon}
          </IconBadge>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink-strong">{title}</p>
            {tag}
          </div>
          {description !== undefined && description !== "" && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-mid">{description}</p>
          )}
        </div>
      </div>
      {control !== undefined && <div className="shrink-0">{control}</div>}
    </div>
  );
}
