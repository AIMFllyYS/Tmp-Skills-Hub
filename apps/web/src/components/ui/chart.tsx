import type { ComponentProps, ReactElement } from "react";
import { ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

/** 图表只用 ink / surface / line，不高饱和彩虹。 */
export const CHART_INK = {
  strong: "#030712",
  mid: "#4b5563",
  faint: "#9ca3af",
  line: "#e5e7eb",
  surface: "#f9fafb",
} as const;

export const CHART_SERIES = [
  CHART_INK.strong,
  CHART_INK.mid,
  CHART_INK.faint,
  CHART_INK.line,
] as const;

export function ChartContainer({
  className,
  children,
}: {
  className?: string;
  children: ReactElement;
}): React.JSX.Element {
  return (
    <div className={cn("h-64 w-full min-h-[200px]", className)}>
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
    <div className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink-strong">
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
