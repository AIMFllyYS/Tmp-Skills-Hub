import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  GitBranchPlus,
  GitCompareArrows,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { UnifiedDiffFile } from "@/components/ui/diff-viewer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBanner } from "@/components/ui/status-banner";
import { Tooltip, TruncateTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConflictDiffViewer } from "./ConflictDiffViewer.js";
import {
  buildConflictAgentPrompt,
  isActiveConflictVariant,
  validateSplitSkillName,
  type ConflictRecordView,
} from "./types.js";

export interface ConflictsViewProps {
  conflicts: readonly ConflictRecordView[];
  selectedSkillName: string | null;
  onSelectSkill: (name: string) => void;
  selectedVariantId: string | null;
  onSelectVariant: (variantId: string) => void;
  diffFiles: readonly UnifiedDiffFile[];
  loadingDiff?: boolean;
  busy?: boolean;
  onKeepActive: (skillName: string) => Promise<void>;
  onPromoteVariant: (skillName: string, variantId: string) => Promise<void>;
  onSplitVariant: (skillName: string, variantId: string, newName: string) => Promise<void>;
  onHandoffToAgent: (skillName: string, prompt: string) => void;
}

type ConfirmAction = "keep-active" | "promote-variant" | null;

function collectConflictClients(conflict: ConflictRecordView): string[] {
  const seen = new Set<string>();
  for (const variant of conflict.variants) {
    for (const client of variant.sourceClients) {
      seen.add(client);
    }
  }
  return Array.from(seen);
}

/** 同名多版本冲突处理主工作区（用于 SkillsPage「冲突」Tab 与 Playbook 演示）。 */
export function ConflictsView({
  conflicts,
  selectedSkillName,
  onSelectSkill,
  selectedVariantId,
  onSelectVariant,
  diffFiles,
  loadingDiff = false,
  busy = false,
  onKeepActive,
  onPromoteVariant,
  onSplitVariant,
  onHandoffToAgent,
}: ConflictsViewProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitName, setSplitName] = useState("");
  const [splitTouched, setSplitTouched] = useState(false);
  const [splitSubmitError, setSplitSubmitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  const effectiveBusy = busy || localBusy;

  const filteredConflicts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword === "") return conflicts;
    return conflicts.filter((item) => {
      if (item.skillName.toLowerCase().includes(keyword)) return true;
      return item.variants.some((v) =>
        v.sourceClients.some((c) => c.toLowerCase().includes(keyword)),
      );
    });
  }, [conflicts, query]);

  const activeConflict = useMemo(() => {
    if (conflicts.length === 0) return null;
    if (selectedSkillName !== null) {
      const matched = conflicts.find((c) => c.skillName === selectedSkillName);
      if (matched !== undefined) return matched;
    }
    return filteredConflicts[0] ?? conflicts[0] ?? null;
  }, [conflicts, filteredConflicts, selectedSkillName]);

  const collidingVariants = useMemo(() => {
    if (activeConflict === null) return [];
    return activeConflict.variants.filter(
      (variant) => !isActiveConflictVariant(variant, activeConflict.activeHash),
    );
  }, [activeConflict]);

  const effectiveVariantId = useMemo(() => {
    if (activeConflict === null) return null;
    if (
      selectedVariantId !== null &&
      collidingVariants.some((variant) => variant.variantId === selectedVariantId)
    ) {
      return selectedVariantId;
    }
    return collidingVariants[0]?.variantId ?? null;
  }, [activeConflict, collidingVariants, selectedVariantId]);

  const splitValidationError =
    activeConflict === null
      ? null
      : validateSplitSkillName(splitName, activeConflict.skillName);

  const handleConfirm = async (): Promise<void> => {
    if (activeConflict === null || confirmAction === null) return;
    setLocalBusy(true);
    setActionError(null);
    try {
      if (confirmAction === "keep-active") {
        await onKeepActive(activeConflict.skillName);
      } else if (confirmAction === "promote-variant" && effectiveVariantId !== null) {
        await onPromoteVariant(activeConflict.skillName, effectiveVariantId);
      }
      setConfirmAction(null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
      setConfirmAction(null);
    } finally {
      setLocalBusy(false);
    }
  };

  const openSplitDialog = (): void => {
    setSplitName("");
    setSplitTouched(false);
    setSplitSubmitError(null);
    setSplitOpen(true);
  };

  const handleSplitSubmit = async (): Promise<void> => {
    if (activeConflict === null || effectiveVariantId === null) return;
    setSplitTouched(true);
    if (splitValidationError !== null) return;
    setLocalBusy(true);
    setSplitSubmitError(null);
    try {
      await onSplitVariant(activeConflict.skillName, effectiveVariantId, splitName.trim());
      setSplitOpen(false);
    } catch (e: unknown) {
      setSplitSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  };

  if (conflicts.length === 0) {
    return (
      <div
        className="motion-enter flex min-h-0 flex-1 items-center justify-center p-6"
        data-testid="conflicts-empty"
      >
        <Card className="max-w-md space-y-2 text-center">
          <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-green-50 text-green-700">
            <CheckCircle2 className="size-4" aria-hidden />
          </div>
          <p className="text-sm font-medium text-ink-strong">当前没有待处理的同名冲突</p>
          <p className="text-xs text-ink-mid">
            所有客户端中的同名 Skill 均已收敛至唯一真源，不存在未决版本分叉。
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="motion-enter flex min-h-0 flex-1 overflow-hidden bg-white"
      data-testid="conflicts-view"
    >
      <aside className="flex w-64 shrink-0 flex-col border-r border-line">
        <div className="shrink-0 space-y-2 border-b border-line p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索冲突 Skill 或客户端…"
              aria-label="搜索冲突 Skill"
              data-testid="conflicts-search"
              className="pl-8"
            />
          </div>
          <p className="text-xs text-ink-faint">
            {query.trim() === ""
              ? "共 " + String(conflicts.length) + " 项待处理冲突"
              : "匹配 " + String(filteredConflicts.length) + " / " + String(conflicts.length) + " 项"}
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1 py-2">
          {filteredConflicts.length === 0 ? (
            <p className="px-4 py-3 text-xs text-ink-mid">未找到匹配的冲突 Skill。</p>
          ) : (
            <div className="space-y-1 px-2">
              {filteredConflicts.map((item) => {
                const selected = activeConflict?.skillName === item.skillName;
                const clients = collectConflictClients(item);
                const visibleClients = clients.slice(0, 3);
                const extraClientCount = clients.length - visibleClients.length;
                return (
                  <button
                    key={item.skillName}
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    data-testid={"conflict-item-" + item.skillName}
                    onClick={() => onSelectSkill(item.skillName)}
                    className={cn(
                      "motion-row flex w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-line-strong",
                      selected
                        ? "bg-surface text-ink-strong"
                        : "text-ink-mid hover:bg-surface/70 hover:text-ink-strong",
                    )}
                  >
                    <div className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        {item.shorterContentWarning && (
                          <Tooltip label="较新版本内容更短，请优先核对" side="right">
                            <AlertTriangle
                              className="size-4 shrink-0 text-amber-800"
                              aria-label="内容变短预警"
                            />
                          </Tooltip>
                        )}
                        <TruncateTip
                          text={item.skillName}
                          className="min-w-0 flex-1 text-sm font-medium text-ink-strong"
                        />
                      </span>
                      <Badge tone={item.shorterContentWarning ? "warning" : "neutral"} className="shrink-0">
                        {String(item.variants.length)} 变体
                      </Badge>
                    </div>
                    {visibleClients.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {visibleClients.map((client) => (
                          <Badge key={client} tone="neutral">
                            {client}
                          </Badge>
                        ))}
                        {extraClientCount > 0 && (
                          <Badge tone="neutral">+{String(extraClientCount)}</Badge>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeConflict !== null && (
          <>
            <header className="shrink-0 border-b border-line bg-white px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <GitCompareArrows className="size-4 shrink-0 text-ink-mid" aria-hidden />
                  <h2 className="truncate text-base font-medium text-ink-strong">
                    {activeConflict.skillName}
                  </h2>
                  <Badge className="font-mono">{activeConflict.activeHash.slice(0, 12)}</Badge>
                  {activeConflict.shorterContentWarning && (
                    <Badge tone="warning">内容变短预警</Badge>
                  )}
                </div>
                <span className="text-xs text-ink-faint">
                  冲突池保留全部异版，任何决议均不发生真删除
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="conflict-keep-active"
                  disabled={effectiveBusy}
                  onClick={() => setConfirmAction("keep-active")}
                >
                  <ShieldCheck className="size-4 text-ink-mid" aria-hidden />
                  保留当前真源
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="conflict-promote-variant"
                  disabled={effectiveBusy || effectiveVariantId === null}
                  onClick={() => setConfirmAction("promote-variant")}
                >
                  <Check className="size-4 text-ink-mid" aria-hidden />
                  设为真源
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="conflict-split-variant"
                  disabled={effectiveBusy || effectiveVariantId === null}
                  onClick={openSplitDialog}
                >
                  <GitBranchPlus className="size-4 text-ink-mid" aria-hidden />
                  拆分为独立 Skill
                </Button>

                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  data-testid="conflict-handoff-agent"
                  disabled={effectiveBusy}
                  onClick={() =>
                    onHandoffToAgent(
                      activeConflict.skillName,
                      buildConflictAgentPrompt(activeConflict),
                    )
                  }
                >
                  <Bot className="size-4 text-white" aria-hidden />
                  交给 Agent 分析并合并
                </Button>
              </div>
            </header>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-6">
                {actionError !== null && (
                  <StatusBanner
                    tone="danger"
                    surface="card"
                    title="冲突决议执行失败"
                    description={actionError}
                    onDismiss={() => setActionError(null)}
                  />
                )}
                <ConflictDiffViewer
                  conflict={activeConflict}
                  selectedVariantId={effectiveVariantId ?? ""}
                  onSelectVariant={onSelectVariant}
                  diffFiles={diffFiles}
                  loadingDiff={loadingDiff}
                />
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {confirmAction === "keep-active" && activeConflict !== null && (
        <ConfirmDialog
          title="确认保留当前真源"
          body={
            "将保留「" +
            activeConflict.skillName +
            "」当前唯一真源（" +
            activeConflict.activeHash.slice(0, 12) +
            "），其余 " +
            String(collidingVariants.length) +
            " 个冲突变体将自动归档至 archive/conflicts/ 目录留底，不会发生真删除。"
          }
          confirmLabel="保留当前真源"
          tone="default"
          busy={effectiveBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleConfirm()}
        />
      )}

      {confirmAction === "promote-variant" &&
        activeConflict !== null &&
        effectiveVariantId !== null && (
          <ConfirmDialog
            title="确认将所选变体设为真源"
            body={
              "操作前会先把当前唯一真源完整快照保存至 archive/versions/，再将变体 " +
              effectiveVariantId +
              " 扶正为「" +
              activeConflict.skillName +
              "」的唯一真源，其余落选变体归档至 archive/conflicts/。所有软链接无需重建，会自动指向新内容。"
            }
            confirmLabel="设为真源"
            tone="default"
            busy={effectiveBusy}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => void handleConfirm()}
          />
        )}

      <Dialog
        open={splitOpen}
        onOpenChange={(next) => {
          if (effectiveBusy) return;
          setSplitOpen(next);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>拆分为独立 Skill</DialogTitle>
          <DialogDescription>
            {activeConflict !== null && effectiveVariantId !== null
              ? "将变体 " +
                effectiveVariantId +
                " 另存为独立 Skill 目录并注册进总馆，「" +
                activeConflict.skillName +
                "」当前真源保持不变。"
              : "为该变体指定新的英文目录名。"}
          </DialogDescription>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSplitSubmit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="split-skill-name">新 Skill 英文名（kebab-case）</Label>
              <Input
                id="split-skill-name"
                data-testid="split-skill-name-input"
                value={splitName}
                disabled={effectiveBusy}
                placeholder={
                  activeConflict !== null ? activeConflict.skillName + "-v2" : "my-skill-v2"
                }
                className="font-mono"
                onChange={(e) => {
                  setSplitName(e.target.value);
                  setSplitTouched(true);
                  setSplitSubmitError(null);
                }}
              />
              {splitTouched && splitValidationError !== null && (
                <p className="text-xs text-red-700" role="alert">
                  {splitValidationError}
                </p>
              )}
              {splitSubmitError !== null && (
                <p className="text-xs text-red-700" role="alert">
                  {splitSubmitError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                disabled={effectiveBusy}
                onClick={() => setSplitOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="default"
                data-testid="split-skill-submit"
                disabled={effectiveBusy || splitValidationError !== null}
              >
                {effectiveBusy ? "拆分中…" : "确认拆分"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
