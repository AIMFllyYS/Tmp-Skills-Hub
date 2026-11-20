import { useState } from "react";
import { ChevronRight, Clock, FileDiff, GitCommitHorizontal, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DeferredReveal, StaggerItem } from "@/components/ui/deferred-reveal";
import { DiffViewer, type UnifiedDiffFile } from "@/components/ui/diff-viewer";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ICON_STROKE } from "@/components/ui/icon";
import { SkeletonRowList } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCommitTimestamp, type GitCommitEntry } from "./types.js";

export interface SkillHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillName: string;
  commits: readonly GitCommitEntry[];
  loading?: boolean;
  gitEnabled: boolean;
  onSelectCommit?: (hash: string) => void;
  selectedDiffFiles?: readonly UnifiedDiffFile[];
}

/** 单 Skill 的 Git 提交历史抽屉：晚加载骨架过渡 + 交错时间线 + 点击展开嵌入 DiffViewer。 */
export function SkillHistoryDrawer({
  open,
  onOpenChange,
  skillName,
  commits,
  loading = false,
  gitEnabled,
  onSelectCommit,
  selectedDiffFiles,
}: SkillHistoryDrawerProps): React.JSX.Element {
  const [expandedHash, setExpandedHash] = useState<string | null>(() =>
    selectedDiffFiles !== undefined && selectedDiffFiles.length > 0
      ? (commits[0]?.hash ?? null)
      : null,
  );

  const toggleCommit = (hash: string): void => {
    if (expandedHash === hash) {
      setExpandedHash(null);
      return;
    }
    setExpandedHash(hash);
    onSelectCommit?.(hash);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={"历史记录 · " + skillName}
      description={
        gitEnabled
          ? "按时间倒序展示唯一真源目录中该 Skill 的 Git 提交历史，点击任意提交查看文件变更。"
          : "当前未开启 Git 版本控制，暂不追踪该 Skill 的提交历史。"
      }
      headerExtra={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={gitEnabled ? "success" : "neutral"} dot>
            {gitEnabled ? "Git 版本追踪已开启" : "未启用 Git"}
          </Badge>
          {gitEnabled && !loading && (
            <Badge tone="slate">{String(commits.length)} 条提交</Badge>
          )}
        </div>
      }
      className="max-w-2xl"
      testId="skill-history-drawer"
    >
      {!gitEnabled ? (
        <StatusBanner
          tone="neutral"
          surface="card"
          testId="skill-history-disabled"
          title="尚未开启 Git 版本控制"
          description="开启后，每次保存、收录、冲突合并与归档都会自动生成确定性提交记录。请前往左下角「设置 → Git 版本控制」开启。"
        />
      ) : (
        <DeferredReveal
          loading={loading}
          testId={loading ? "skill-history-loading" : undefined}
          skeleton={<SkeletonRowList rows={4} />}
        >
          {commits.length === 0 ? (
            <EmptyState
              icon={<GitCommitHorizontal className="size-5" strokeWidth={ICON_STROKE} />}
              iconTone="surface"
              title="暂无提交历史"
              description="对该 Skill 进行编辑保存或冲突合并后，将在此显示每次变更记录。"
              className="bg-white"
              testId="skill-history-empty"
            />
          ) : (
            <ol
              className="relative space-y-3 border-l border-line pl-5"
              data-testid="skill-history-timeline"
            >
              {commits.map((commit, idx) => {
                const expanded = expandedHash === commit.hash;
                const shortHash =
                  commit.shortHash !== "" ? commit.shortHash : commit.hash.slice(0, 7);
                const hasStats =
                  commit.filesChanged !== undefined ||
                  commit.insertions !== undefined ||
                  commit.deletions !== undefined;

                return (
                  <li key={commit.hash} className="relative">
                    <StaggerItem index={idx}>
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-4 -left-[25px] size-2.5 rounded-full border-2 bg-white",
                          expanded ? "border-ink-strong bg-ink-strong" : "border-line-strong",
                        )}
                      />

                      <button
                        type="button"
                        aria-expanded={expanded}
                        data-testid={"history-commit-" + shortHash}
                        onClick={() => toggleCommit(commit.hash)}
                        className={cn(
                          "motion-row flex w-full flex-col gap-2 rounded-2xl border p-4 text-left shadow-[var(--shadow-card)] outline-none focus-visible:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong",
                          expanded
                            ? "border-ink-strong bg-white"
                            : "border-line bg-white hover:border-line-strong",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge className="font-mono" tone={expanded ? "success" : "slate"} dot={expanded}>
                              {shortHash}
                            </Badge>
                            <Tooltip label={commit.timestamp} side="top">
                              <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                                <Clock className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                                {formatCommitTimestamp(commit.timestamp)}
                              </span>
                            </Tooltip>
                          </div>
                          <ChevronRight
                            className={cn(
                              "motion-chevron size-4 shrink-0 text-ink-mid",
                              expanded && "rotate-90 text-ink-strong",
                            )}
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                          />
                        </div>

                        <p className="text-sm font-medium leading-snug text-ink-strong">
                          {commit.message}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-mid">
                          <span className="inline-flex items-center gap-1.5">
                            <User className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                            {commit.author}
                          </span>

                          {hasStats && (
                            <span className="inline-flex items-center gap-2 font-mono">
                              {commit.filesChanged !== undefined && (
                                <span className="inline-flex items-center gap-1 text-ink-mid">
                                  <FileDiff className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                                  {String(commit.filesChanged)} 文件
                                </span>
                              )}
                              {commit.insertions !== undefined && (
                                <span className="text-emerald-700">+{String(commit.insertions)}</span>
                              )}
                              {commit.deletions !== undefined && (
                                <span className="text-red-700">-{String(commit.deletions)}</span>
                              )}
                            </span>
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="motion-reveal mt-2.5" data-testid={"history-diff-" + shortHash}>
                          {selectedDiffFiles !== undefined ? (
                            <DiffViewer
                              key={commit.hash}
                              files={selectedDiffFiles}
                              emptyText="该提交没有可展示的文本文件差异。"
                            />
                          ) : (
                            <div className="rounded-2xl border border-line bg-white p-4 text-center text-xs text-ink-mid">
                              {onSelectCommit !== undefined
                                ? "正在等待该提交的逐文件差异数据…"
                                : "当前视图未附加该提交的逐文件差异。"}
                            </div>
                          )}
                        </div>
                      )}
                    </StaggerItem>
                  </li>
                );
              })}
            </ol>
          )}
        </DeferredReveal>
      )}
    </Drawer>
  );
}
