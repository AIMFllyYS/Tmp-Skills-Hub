import type { ComponentProps, ReactElement } from "react";
import { ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

/** 轴/网格仍用 ink；系列色只给统计图。 */
export const CHART_INK = {
  strong: "#0b0c0e",
  mid: "#4a505a",
  faint: "#8b919b",
  line: "#e7e7e1",
  surface: "#f5f5f2",
} as const;

/** ui-design-v2 §2.3:启用 = 信号色系、查看 = 天蓝;来源两档琥珀 / 紫。 */
export const CHART_COLOR = {
  show: "#38bdf8",
  enable: "#9ccc2a",
  amber: "#d98a06",
  purple: "#7c6cf0",
} as const;

export const CHART_SERIES = [
  CHART_COLOR.show,
  CHART_COLOR.enable,
  CHART_COLOR.amber,
  CHART_COLOR.purple,
] as const;

export function ChartContainer({
  className,
  heightPx,
  children,
}: {
  className?: string;
  heightPx?: number;
  children: ReactElement;
}): React.JSX.Element {
  const height = heightPx ?? 256;
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipItem {
  name?: string;
  value?: number | string;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipItem>;
  label?: string | number;
}): React.JSX.Element | null {
  if (active !== true || payload === undefined || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink-strong shadow-pop">
      {label !== undefined && label !== "" && <p className="font-medium">{String(label)}</p>}
      {payload.map((p) => (
        <p key={String(p.name)} className="text-ink-mid">
          {p.name}: {String(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ChartTooltip(
  props: ComponentProps<typeof RechartsTooltip>,
): React.JSX.Element {
  return <RechartsTooltip {...props} />;
}
