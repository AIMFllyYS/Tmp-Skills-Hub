import type { ArchivedSkill } from "./types.js";

function formatBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

/** 归档区:列出已归档内容与绝对路径(软删除铁律的可见部分)。没有真删除按钮。 */
export function ArchivePanel({ archived }: { archived: ArchivedSkill[] }): React.JSX.Element {
  if (archived.length === 0) {
    return <p className="text-sm text-ink-mid">归档区是空的。归档 = 软删除:本工具不提供真删除。</p>;
  }
  return (
    <ul className="space-y-3">
      {archived.map((a) => (
        <li key={a.file} className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium text-ink-strong">{a.name}</h2>
            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-mid">
              {formatBytes(a.sizeBytes)}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-faint break-all">{a.file}</p>
          <p className="mt-1 text-xs text-ink-mid">
            归档于 {new Date(a.archivedAt).toLocaleString()} · 如需彻底删除,请自行处理上述文件(本工具不提供真删除)
          </p>
        </li>
      ))}
    </ul>
  );
}
