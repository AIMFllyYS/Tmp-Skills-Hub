import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  wave = true,
}: {
  className?: string;
  wave?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-[10px] bg-surface",
        wave
          ? "skeleton-wave motion-safe:animate-skeleton motion-reduce:animate-none"
          : "motion-safe:animate-skeleton motion-reduce:animate-none",
        className,
      )}
      aria-hidden
    />
  );
}

/** 指标卡片晚加载骨架（3 栏 KPI 占位，与 MetricCard 等高无跳动）。 */
export function SkeletonMetricGrid({ count = 3 }: { count?: number }): React.JSX.Element {
  return (
    <div className="grid gap-3.5 sm:grid-cols-3" aria-busy="true" aria-label="加载指标数据">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
            <Skeleton className="size-9 rounded-[10px]" />
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 列表/设置行晚加载骨架（与 SettingGroup 等宽等高）。 */
export function SkeletonRowList({ rows = 3 }: { rows?: number }): React.JSX.Element {
  return (
    <div
      className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]"
      aria-busy="true"
      aria-label="加载列表数据"
    >
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="size-8 shrink-0 rounded-[9px]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-7 w-16 shrink-0 rounded-[9px]" />
        </div>
      ))}
    </div>
  );
}

/** 主区首次加载：三张卡 + 列表行，不用「加载中…」当唯一反馈。 */
export function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-5 p-6" aria-busy="true" aria-label="加载中" data-testid="page-skeleton">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <SkeletonMetricGrid count={3} />
      <SkeletonRowList rows={3} />
    </div>
  );
}
