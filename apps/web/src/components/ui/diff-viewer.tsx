import { FileCode2, FileMinus2, FilePlus2, FileText } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge.js";
import { ICON_STROKE } from "./icon.js";
import { ScrollArea } from "./scroll-area.js";

export type DiffFileStatus = "added" | "removed" | "modified" | "unchanged";

export interface DiffLine {
  kind: "context" | "add" | "del";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface UnifiedDiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface UnifiedDiffFile {
  relPath: string;
  status: DiffFileStatus;
  isBinary?: boolean;
  truncated?: boolean;
  sizeA?: number;
  sizeB?: number;
  hunks?: UnifiedDiffHunk[];
}

const STATUS_META: Record<
  DiffFileStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "danger"; icon: typeof FileText }
> = {
  added: { label: "新增", tone: "success", icon: FilePlus2 },
  removed: { label: "移除", tone: "danger", icon: FileMinus2 },
  modified: { label: "变更", tone: "warning", icon: FileCode2 },
  unchanged: { label: "相同", tone: "neutral", icon: FileText },
};

/** 确定性逐文件 Unified Diff 视图（复用于冲突对比与 Git 历史抽屉，同心圆角 + 精雕线宽 + 克制浅绿/浅红语义）。 */
export function DiffViewer({
  files,
  emptyText = "两个版本间没有文件差异。",
  className,
}: {
  files: readonly UnifiedDiffFile[];
  emptyText?: string;
  className?: string;
}): React.JSX.Element {
  const defaultPath = files.find((f) => f.status !== "unchanged")?.relPath ?? files[0]?.relPath ?? null;
  const [selectedPath, setSelectedPath] = useState<string | null>(defaultPath);
  const current = files.find((f) => f.relPath === selectedPath) ?? files[0] ?? null;

  if (files.length === 0) {
    return (
      <div className={cn("rounded-2xl border border-line bg-canvas p-6 text-center text-sm text-ink-mid", className)}>
        {emptyText}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid min-h-0 grid-cols-1 overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)] md:grid-cols-[232px_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="min-w-0 overflow-hidden border-b border-line bg-canvas md:border-r md:border-b-0">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 text-xs font-medium text-ink-mid">
          <span>变更文件</span>
          <span className="font-mono text-[11px] text-ink-faint">{String(files.length)}</span>
        </div>
        <ScrollArea className="max-h-64 md:max-h-[420px]">
          <ul className="space-y-0.5 p-1.5">
            {files.map((file) => {
              const meta = STATUS_META[file.status];
              const Icon = meta.icon;
              const active = current?.relPath === file.relPath;
              return (
                <li key={file.relPath} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedPath(file.relPath)}
                    className={cn(
                      "motion-row flex w-full min-w-0 items-center justify-between gap-2 rounded-[9px] px-2.5 py-2 text-left text-xs outline-none",
                      active
                        ? "border border-line bg-white font-medium text-ink-strong shadow-[var(--shadow-thumb)]"
                        : "border border-transparent text-ink-mid hover:bg-white/70 hover:text-ink-strong",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                      <Icon className="size-3.5 shrink-0 text-ink-faint" strokeWidth={ICON_STROKE} aria-hidden />
                      <span className="truncate font-mono">{file.relPath}</span>
                    </span>
                    <Badge tone={meta.tone} className="shrink-0 px-2 py-0 text-[11px]">
                      {meta.label}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-col bg-white">
        {current !== null && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-4 py-2.5">
              <span className="font-mono text-xs font-medium text-ink-strong">{current.relPath}</span>
              <div className="flex items-center gap-2">
                {current.truncated === true && <Badge tone="warning">超长已截断</Badge>}
                <Badge tone={STATUS_META[current.status].tone} dot>
                  {STATUS_META[current.status].label}
                </Badge>
              </div>
            </div>
            <ScrollArea className="max-h-[420px]">
              {current.isBinary === true ? (
                <div className="p-6 text-center text-xs text-ink-mid">
                  二进制文件（{String(current.sizeA ?? 0)} B → {String(current.sizeB ?? 0)} B），不展示文本行差异。
                </div>
              ) : current.hunks === undefined || current.hunks.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-mid">
                  {current.status === "unchanged" ? "该文件内容完全一致。" : "无行级差异详情。"}
                </div>
              ) : (
                <div className="font-mono text-xs leading-6">
                  {current.hunks.map((hunk, hi) => (
                    <div key={hi}>
                      <div className="border-y border-line bg-canvas px-3.5 py-1 text-[11px] text-ink-faint">
                        {hunk.header}
                      </div>
                      {hunk.lines.map((line, li) => (
                        <div
                          key={li}
                          className={cn(
                            "grid grid-cols-[40px_40px_20px_minmax(0,1fr)] px-2",
                            line.kind === "add" && "bg-emerald-50/75 text-emerald-900",
                            line.kind === "del" && "bg-red-50/80 text-red-800",
                            line.kind === "context" && "text-ink-mid",
                          )}
                        >
                          <span className="select-none pr-2 text-right text-ink-faint/80 tabular-nums">
                            {line.oldLine !== undefined ? String(line.oldLine) : ""}
                          </span>
                          <span className="select-none pr-2 text-right text-ink-faint/80 tabular-nums">
                            {line.newLine !== undefined ? String(line.newLine) : ""}
                          </span>
                          <span className="select-none text-center font-medium">
                            {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                          </span>
                          <span className="whitespace-pre-wrap break-all">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
