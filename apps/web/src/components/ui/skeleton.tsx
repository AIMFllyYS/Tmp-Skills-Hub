import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={cn("rounded-lg bg-surface-strong/70 motion-safe:animate-skeleton", className)}
      aria-hidden
    />
  );
}

/** 主区首次加载：三张卡 + 两行，不用「加载中…」当唯一反馈。 */
export function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4 px-8 py-7" aria-busy="true" aria-label="加载中" data-testid="page-skeleton">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-3 sm:grid-cols-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}
