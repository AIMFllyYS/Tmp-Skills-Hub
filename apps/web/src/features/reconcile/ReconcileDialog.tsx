import {
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  FolderSync,
  ShieldOff,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DeferredReveal } from "@/components/ui/deferred-reveal";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ICON_STROKE, IconBadge, ShieldAuditGlyph, SymlinkMeshGlyph } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton, SkeletonRowList } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { StepList, type StepItem } from "@/components/ui/step-list";
import { TruncateTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBytes } from "../shell/SettingsV3Panels.js";
import {
  countReconcilePreviewActions,
  formatReconcileMtime,
  type ReconcilePreviewData,
  type ReconcileUntouchedReason,
} from "./types.js";

const UNTOUCHED_REASON_LABEL: Record<ReconcileUntouchedReason, string> = {
  "system-dir": "系统保留目录",
  "non-skill-file": "非 Skill 文件",
  "incomplete-skill": "写入未完成 / 缺 SKILL.md",
  ignored: "规则忽略",
};

function PreviewSection({
  title,
  count,
  badgeTone = "neutral",
  icon,
  defaultOpen,
  testId,
  children,
}: {
  title: string;
  count: number;
  badgeTone?: "neutral" | "warning" | "success" | "danger";
  icon: ReactNode;
  defaultOpen: boolean;
  testId?: string;
  children: ReactNode;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="space-y-2">
      <CollapsibleTrigger data-testid={testId}>
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight
            className={cn("motion-chevron size-4 shrink-0 text-ink-mid", expanded && "rotate-90")}
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          {icon}
          <span className="truncate font-medium text-ink-strong">{title}</span>
        </span>
        <Badge tone={badgeTone} className="shrink-0">
          {String(count) + " 项"}
        </Badge>
      </CollapsibleTrigger>
      <CollapsiblePanel className="space-y-2">{children}</CollapsiblePanel>
    </Collapsible>
  );
}

export interface ReconcileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ReconcilePreviewData | null;
  loading?: boolean;
  busy?: boolean;
  includeExternalLinks: boolean;
  onIncludeExternalLinksChange: (v: boolean) => void;
  onApply: () => Promise<void>;
}

/** 一键接管预览与确认弹窗：晚加载骨架过渡 + 强制备份保障 + 新收录/换链/冲突/外部软链明细。 */
export function ReconcileDialog({
  open,
  onOpenChange,
  preview,
  loading = false,
  busy = false,
  includeExternalLinks,
  onIncludeExternalLinksChange,
  onApply,
}: ReconcileDialogProps): React.JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const isBusy = busy || submitting;

  const combinedNewAndRelink =
    preview === null ? [] : [...preview.toAdopt, ...preview.toRelinkIdentical];
  const actionableCount = countReconcilePreviewActions(preview, includeExternalLinks);

  const guaranteeSteps: StepItem[] =
    preview === null
      ? []
      : [
          {
            id: "backup",
            title: "前置强制全量备份并 SHA-256 校验",
            detail:
              "动任何客户端真实目录前，先完整备份至 " +
              preview.backupDir +
              "；校验失败立即中止，零改动。",
            status: isBusy ? "active" : "idle",
          },
          {
            id: "ingest",
            title: "零丢失入唯一真源与冲突池",
            detail:
              "新收录 " +
              String(preview.toAdopt.length) +
              " 项、同内容换链 " +
              String(preview.toRelinkIdentical.length) +
              " 项；" +
              String(preview.conflicts.length) +
              " 项同名冲突全部异版留底。",
            status: "idle",
          },
          {
            id: "relink",
            title: "Journal 原子原地挂回纯软链接",
            detail:
              "仅精准移出有效 Skill 目录，原地创建指向 " +
              preview.skillsRoot +
              " 的纯软链接；失败自动逆序回滚。" +
              (preview.danglingToPrune !== undefined && preview.danglingToPrune > 0
                ? " 同时清理 " + String(preview.danglingToPrune) + " 条悬空台账。"
                : ""),
            status: "idle",
          },
        ];

  const handleOpenChange = (next: boolean): void => {
    if (isBusy) return;
    onOpenChange(next);
  };

  const handleApply = async (): Promise<void> => {
    if (isBusy || preview === null || actionableCount === 0) return;
    setSubmitting(true);
    try {
      await onApply();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal={isBusy}>
      <DialogContent
        className="flex max-h-[min(44rem,90vh)] max-w-2xl flex-col"
        data-testid="reconcile-dialog"
      >
        <div className="flex items-start gap-3">
          <IconBadge size="md" tone="obsidian">
            <SymlinkMeshGlyph size={18} />
          </IconBadge>
          <div className="min-w-0 flex-1">
            <DialogTitle>预览备份与一键接管方案</DialogTitle>
            <DialogDescription>
              将客户端中未接管的真实目录收敛入唯一真源，并原地替换为纯软链接。系统保留目录与未勾选的外部软链接保持原样不动。
            </DialogDescription>
          </div>
        </div>

        <ScrollArea className="mt-4 min-h-0 flex-1">
          <DeferredReveal
            loading={loading || preview === null}
            skeleton={
              <div className="space-y-3.5 pr-1" aria-label="正在生成接管预览">
                <Skeleton className="h-20 w-full rounded-xl" />
                <SkeletonRowList rows={3} />
              </div>
            }
          >
            {preview !== null && (
              <div className="space-y-4 pr-1">
                <StatusBanner
                  surface="card"
                  tone={preview.conflicts.length > 0 ? "warning" : "info"}
                  title={
                    preview.backupRequired
                      ? "执行前将强制生成去重备份快照至 " + preview.backupDir
                      : "已就绪：可安全执行纯软链接收敛"
                  }
                  description="只有当备份快照校验通过后，才会开始移出客户端真实目录并切换软链接。"
                />

                <div className="rounded-2xl border border-line bg-canvas p-4">
                  <StepList items={guaranteeSteps} />
                </div>

                {actionableCount === 0 && preview.skippedExternalLinks.length === 0 && (
                  <StatusBanner
                    surface="card"
                    tone="success"
                    title="所有客户端目录均为 100% 受管纯软链接"
                    description="当前没有需要收录、换链或处理的冲突条目。"
                  />
                )}

                {combinedNewAndRelink.length > 0 && (
                  <PreviewSection
                    title="新增 / 同内容转纯软链接"
                    count={combinedNewAndRelink.length}
                    icon={<FolderSync className="size-4 shrink-0 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />}
                    defaultOpen={true}
                    testId="reconcile-section-adopt"
                  >
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                      {combinedNewAndRelink.map((item) => (
                        <li
                          key={item.action + ":" + item.skillName + ":" + item.hash}
                          className="space-y-1.5 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="truncate font-mono text-xs font-medium text-ink-strong">
                                {item.skillName}
                              </span>
                              <Badge tone={item.action === "adopt" ? "success" : "neutral"} dot>
                                {item.action === "adopt" ? "新收录" : "同内容换链"}
                              </Badge>
                              {item.replacesBrokenLink === true && (
                                <Badge tone="warning">修复被覆写链接</Badge>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-xs text-ink-faint">
                              {String(item.fileCount) + " 文件 · " + formatBytes(item.totalBytes)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-ink-faint">来源：</span>
                            {item.sourceClients.map((client) => (
                              <Badge key={client}>{client}</Badge>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </PreviewSection>
                )}

                {preview.conflicts.length > 0 && (
                  <PreviewSection
                    title="同名多版本冲突（全变体入池留底）"
                    count={preview.conflicts.length}
                    badgeTone="warning"
                    icon={<AlertTriangle className="size-4 shrink-0 text-amber-700" strokeWidth={ICON_STROKE} aria-hidden />}
                    defaultOpen={true}
                    testId="reconcile-section-conflicts"
                  >
                    <p className="px-1 text-xs leading-relaxed text-ink-mid">
                      所有异版都会完整留存至 <code className="font-mono text-ink-strong">~/.skills-hub/conflicts/</code>
                      ；按目录内有效文件最新修改时间暂定唯一真源并立即挂回软链，合并后可在「Skills 管理 → 冲突」逐文件 Diff 裁决。
                    </p>
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                      {preview.conflicts.map((item) => (
                        <li key={item.skillName} className="space-y-2 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="truncate font-mono text-xs font-medium text-ink-strong">
                                {item.skillName}
                              </span>
                              <Badge tone="warning" dot>
                                {String(item.variantCount) + " 个版本"}
                              </Badge>
                              {item.shorterContentWarning && (
                                <Badge tone="warning" data-testid="reconcile-shorter-warning">
                                  最新内容显著更短或时间差过近，请复核
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mid">
                            <span>
                              暂定主版：
                              <span className="font-mono font-medium text-ink-strong">
                                {item.provisionalWinnerClient}
                              </span>
                            </span>
                            <span>
                              最新文件时间：
                              <span className="font-mono text-ink-strong">
                                {formatReconcileMtime(item.maxMtimeMs)}
                              </span>
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-ink-faint">涉及来源：</span>
                            {item.involvedClients.map((client) => (
                              <Badge
                                key={client}
                                tone={client === item.provisionalWinnerClient ? "success" : "neutral"}
                              >
                                {client === item.provisionalWinnerClient ? client + "（暂定）" : client}
                              </Badge>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </PreviewSection>
                )}

                {preview.skippedExternalLinks.length > 0 && (
                  <PreviewSection
                    title="外部托管软链接（默认跳过不动）"
                    count={preview.skippedExternalLinks.length}
                    icon={<ExternalLink className="size-4 shrink-0 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />}
                    defaultOpen={true}
                    testId="reconcile-section-external"
                  >
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-canvas px-3.5 py-3">
                      <Checkbox
                        checked={includeExternalLinks}
                        disabled={isBusy}
                        onCheckedChange={(checked) => onIncludeExternalLinksChange(checked)}
                        className="mt-0.5"
                        data-testid="reconcile-include-external-checkbox"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-ink-strong">一并拷入总馆接管</span>
                        <p className="mt-0.5 text-xs text-ink-mid">
                          默认保留外部软链接原样；勾选后将把目标内容复制到唯一真源，并将客户端链接改为指向总馆。
                        </p>
                      </div>
                    </label>
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                      {preview.skippedExternalLinks.map((item) => (
                        <li
                          key={item.clientId + ":" + item.skillName + ":" + item.linkPath}
                          className="space-y-1 px-4 py-2.5"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs font-medium text-ink-strong">
                              {item.skillName}
                            </span>
                            <Badge>{item.clientId}</Badge>
                            {item.validSkill === false && <Badge tone="warning">缺少 SKILL.md</Badge>}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                            <span className="shrink-0">目标：</span>
                            <TruncateTip text={item.targetPath} className="font-mono text-xs text-ink-mid" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </PreviewSection>
                )}

                {preview.untouchedNonSkill.length > 0 && (
                  <PreviewSection
                    title="保持不动的非 Skill 文件与保留目录"
                    count={preview.untouchedNonSkill.length}
                    icon={<ShieldOff className="size-4 shrink-0 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />}
                    defaultOpen={false}
                    testId="reconcile-section-untouched"
                  >
                    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                      {preview.untouchedNonSkill.map((entry) => (
                        <li
                          key={entry.clientId + ":" + entry.name + ":" + (entry.path ?? "")}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-mono text-xs text-ink-strong">{entry.name}</span>
                            <Badge>{entry.clientId}</Badge>
                          </div>
                          <Badge>{UNTOUCHED_REASON_LABEL[entry.reason]}</Badge>
                        </li>
                      ))}
                    </ul>
                  </PreviewSection>
                )}
              </div>
            )}
          </DeferredReveal>
        </ScrollArea>

        <Separator className="mt-4" />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-ink-mid">
            <ShieldAuditGlyph size={16} className="text-ink-mid" />
            {loading || preview === null ? (
              <span>正在分析客户端差异…</span>
            ) : actionableCount > 0 ? (
              <span>
                将处理 {String(actionableCount)} 项
                {preview.conflicts.length > 0
                  ? "（含 " + String(preview.conflicts.length) + " 项冲突留底）"
                  : ""}
              </span>
            ) : (
              <span>当前无待合并条目</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={loading || isBusy || preview === null || actionableCount === 0}
              data-testid="reconcile-apply-button"
              onClick={() => void handleApply()}
            >
              {isBusy ? "备份并合并中…" : "备份并一键合并"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
