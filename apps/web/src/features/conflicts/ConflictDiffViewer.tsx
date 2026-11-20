import { Clock, FileStack, GitCompareArrows, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DiffViewer, type UnifiedDiffFile } from "@/components/ui/diff-viewer";
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

/** 同名冲突变体对比视图：预警条 + 活跃真源/异版卡片切换 + 逐文件 Unified Diff。 */
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
    <div className="space-y-4" data-testid="conflict-diff-viewer">
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
            <Layers className="size-4 text-ink-mid" aria-hidden />
            <span>版本卡片（点击冲突变体切换下方差异对比目标）</span>
          </p>
          <span className="text-xs text-ink-faint">
            共 {String(collidingVariants.length)} 个待决冲突变体
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            className="flex flex-col justify-between gap-3 bg-surface p-3.5"
            data-testid="conflict-active-card"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium text-ink-strong">{activePrefix}</span>
                <Badge tone="success">当前真源</Badge>
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
                <Clock className="size-4 text-ink-faint" aria-hidden />
                {activeVariant !== null
                  ? formatConflictTime(activeVariant.maxMtimeMs)
                  : formatConflictTime(conflict.updatedAt)}
              </span>
              {activeVariant !== null ? (
                <span className="inline-flex items-center gap-1">
                  <FileStack className="size-4 text-ink-faint" aria-hidden />
                  {String(activeVariant.fileCount)} 文件 · {formatConflictBytes(activeVariant.totalBytes)}
                </span>
              ) : (
                <span className="text-ink-faint">唯一真源活跃副本</span>
              )}
            </div>
          </Card>

          {collidingVariants.map((variant) => {
            const selected = variant.variantId === selectedVariantId;
            return (
              <button
                key={variant.variantId}
                type="button"
                aria-pressed={selected}
                data-testid={"conflict-variant-" + variant.variantId}
                onClick={() => onSelectVariant(variant.variantId)}
                className={cn(
                  "motion-press motion-fill flex flex-col justify-between gap-3 rounded-xl border p-3.5 text-left outline-none focus-visible:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong",
                  selected
                    ? "border-ink-strong bg-white"
                    : "border-line bg-white hover:border-line-strong hover:bg-surface/60",
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-ink-strong">
                      {variant.hash.slice(0, 12)}
                    </span>
                    <Badge tone={selected ? "warning" : "neutral"}>
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
                    <Clock className="size-4 text-ink-faint" aria-hidden />
                    {formatConflictTime(variant.maxMtimeMs)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileStack className="size-4 text-ink-faint" aria-hidden />
                    {String(variant.fileCount)} 文件 · {formatConflictBytes(variant.totalBytes)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="逐文件差异对比" className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mid">
            <GitCompareArrows className="size-4 text-ink-mid" aria-hidden />
            <span>差异对比：</span>
            <span className="font-mono text-ink-strong">当前真源 ({activePrefix})</span>
            <span className="text-ink-faint">↔</span>
            <span className="font-mono text-ink-strong">
              {selectedVariantId !== "" ? "变体 (" + selectedVariantId + ")" : "未选择变体"}
            </span>
          </div>
          {!loadingDiff && (
            <Badge tone={changedCount > 0 ? "warning" : "neutral"}>
              {String(changedCount)} 处文件变更
            </Badge>
          )}
        </div>

        {loadingDiff ? (
          <div
            className="space-y-2.5 rounded-xl border border-line bg-white p-4"
            aria-busy="true"
            aria-label="正在计算逐文件差异"
            data-testid="conflict-diff-loading"
          >
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <DiffViewer
            key={conflict.skillName + ":" + selectedVariantId}
            files={diffFiles}
            emptyText="当前真源与所选冲突变体之间没有文件内容差异。"
          />
        )}
      </section>
    </div>
  );
}
