import { Clock, FileStack, GitCompareArrows, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DeferredReveal, StaggerItem } from "@/components/ui/deferred-reveal";
import { DiffViewer, type UnifiedDiffFile } from "@/components/ui/diff-viewer";
import { ICON_STROKE } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { cn } from "@/lib/utils";
import {
  formatConflictBytes,
  formatConflictTime,
  isActiveConflictVariant,
  type ConflictRecordView,
} from "./types.js";

export interface ConflictDiffViewerProps {
  conflict: ConflictRecordView;
  selectedVariantId: string;
  onSelectVariant: (variantId: string) => void;
  diffFiles: readonly UnifiedDiffFile[];
  loadingDiff?: boolean;
}

/** 同名冲突变体对比视图：预警条 + 活跃真源/异版卡片交错揭示 + 晚加载 Unified Diff。 */
export function ConflictDiffViewer({
  conflict,
  selectedVariantId,
  onSelectVariant,
  diffFiles,
  loadingDiff = false,
}: ConflictDiffViewerProps): React.JSX.Element {
  const activeVariant =
    conflict.variants.find((variant) => isActiveConflictVariant(variant, conflict.activeHash)) ?? null;
  const collidingVariants = conflict.variants.filter(
    (variant) => !isActiveConflictVariant(variant, conflict.activeHash),
  );
  const activePrefix = conflict.activeHash.slice(0, 12);
  const changedCount = diffFiles.filter((file) => file.status !== "unchanged").length;

  return (
    <div className="space-y-5" data-testid="conflict-diff-viewer">
      {conflict.shorterContentWarning && (
        <StatusBanner
          tone="warning"
          surface="card"
          testId="conflict-shorter-warning"
          title="检测到较新版本内容更短，请谨慎核对"
          description="当前暂定真源的总字节数少于较早版本，可能包含意外删减或未写完的内容。建议先核对逐文件差异，再决定保留、扶正或交给 Agent 融合。"
        />
      )}

      <section aria-label="冲突版本列表" className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-mid">
            <Layers className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
            <span>版本卡片（点击冲突变体切换下方差异对比目标）</span>
          </p>
          <span className="text-xs text-ink-faint">
            共 {String(collidingVariants.length)} 个待决冲突变体
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StaggerItem index={0}>
            <Card
              className="flex h-full flex-col justify-between gap-3 border-emerald-200/80 bg-emerald-50/35 p-4"
              data-testid="conflict-active-card"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-ink-strong">{activePrefix}</span>
                  <Badge tone="success" dot>
                    当前真源
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeVariant !== null && activeVariant.sourceClients.length > 0 ? (
                    activeVariant.sourceClients.map((client) => (
                      <Badge key={client} tone="neutral">
                        {client}
                      </Badge>
                    ))
                  ) : (
                    <Badge tone="neutral">store</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mid">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                  {activeVariant !== null
                    ? formatConflictTime(activeVariant.maxMtimeMs)
                    : formatConflictTime(conflict.updatedAt)}
                </span>
                {activeVariant !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <FileStack className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                    {String(activeVariant.fileCount)} 文件 · {formatConflictBytes(activeVariant.totalBytes)}
                  </span>
                ) : (
                  <span className="text-ink-faint">当前使用的版本</span>
                )}
              </div>
            </Card>
          </StaggerItem>

          {collidingVariants.map((variant, idx) => {
            const selected = variant.variantId === selectedVariantId;
            return (
              <StaggerItem key={variant.variantId} index={idx + 1}>
                <button
                  type="button"
                  aria-pressed={selected}
                  data-testid={"conflict-variant-" + variant.variantId}
                  onClick={() => onSelectVariant(variant.variantId)}
                  className={cn(
                    "motion-card-lift flex h-full w-full flex-col justify-between gap-3 rounded-2xl border p-4 text-left outline-none focus-visible:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong",
                    selected
                      ? "border-ink-strong bg-white shadow-[var(--shadow-lift)]"
                      : "border-line bg-white shadow-[var(--shadow-card)] hover:border-line-strong",
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-ink-strong">
                        {variant.hash.slice(0, 12)}
                      </span>
                      <Badge tone={selected ? "warning" : "neutral"} dot={selected}>
                        {selected ? "对比中" : "冲突变体"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {variant.sourceClients.length > 0 ? (
                        variant.sourceClients.map((client) => (
                          <Badge key={client} tone="neutral">
                            {client}
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="neutral">未知客户端</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mid">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                      {formatConflictTime(variant.maxMtimeMs)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileStack className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                      {String(variant.fileCount)} 文件 · {formatConflictBytes(variant.totalBytes)}
                    </span>
                  </div>
                </button>
              </StaggerItem>
            );
          })}
        </div>
      </section>

      <section aria-label="逐文件差异对比" className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mid">
            <GitCompareArrows className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
            <span>差异对比：</span>
            <span className="font-mono font-medium text-ink-strong">当前真源 ({activePrefix})</span>
            <span className="text-ink-faint">↔</span>
            <span className="font-mono font-medium text-ink-strong">
              {selectedVariantId !== "" ? "变体 (" + selectedVariantId + ")" : "未选择变体"}
            </span>
          </div>
          {!loadingDiff && (
            <Badge tone={changedCount > 0 ? "warning" : "neutral"} dot>
              {String(changedCount)} 处文件变更
            </Badge>
          )}
        </div>

        <DeferredReveal
          loading={loadingDiff}
          testId={loadingDiff ? "conflict-diff-loading" : undefined}
          skeleton={
            <div
              className="space-y-3 rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]"
              aria-label="正在计算逐文件差异"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          }
        >
          <DiffViewer
            key={conflict.skillName + ":" + selectedVariantId}
            files={diffFiles}
            emptyText="当前真源与所选冲突变体之间没有文件内容差异。"
          />
        </DeferredReveal>
      </section>
    </div>
  );
}
