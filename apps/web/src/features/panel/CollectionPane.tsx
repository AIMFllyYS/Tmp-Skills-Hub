import { useEffect, useRef } from "react";
import { ArchivePanel } from "../skills/ArchivePanel.js";
import { SkillRow } from "../skills/SkillRow.js";
import type { ArchivedSkill, SkillRecord } from "../skills/types.js";
import { isSkillScope, type ScopeSelection } from "./scope.js";

export type SortMode = "name" | "usage";

interface CollectionPaneProps {
  scope: ScopeSelection;
  query: string;
  onQuery: (q: string) => void;
  sortMode: SortMode;
  onSortMode: (m: SortMode) => void;
  skills: SkillRecord[];
  archived: ArchivedSkill[];
  clientTotal: number;
  checked: ReadonlySet<string>;
  focusedHash: string | null;
  onToggleCheck: (hash: string, next: boolean) => void;
  onToggleAllVisible: (next: boolean) => void;
  onFocus: (hash: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint";
const selectClass =
  "rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong";

function SelectAllRow({
  visibleHashes,
  checked,
  onToggleAll,
}: {
  visibleHashes: string[];
  checked: ReadonlySet<string>;
  onToggleAll: (next: boolean) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const selectedVisible = visibleHashes.filter((h) => checked.has(h)).length;
  const all = visibleHashes.length > 0 && selectedVisible === visibleHashes.length;
  const some = selectedVisible > 0 && !all;
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = some;
  }, [some]);
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-mid">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        disabled={visibleHashes.length === 0}
        aria-label="全选当前列表"
        onChange={(e) => onToggleAll(e.target.checked)}
      />
      <span>全选 · 已选 {checked.size}</span>
    </div>
  );
}

/** 集合列:搜索/排序/全选 + skill 行,或归档/报告面板。 */
export function CollectionPane({
  scope,
  query,
  onQuery,
  sortMode,
  onSortMode,
  skills,
  archived,
  clientTotal,
  checked,
  focusedHash,
  onToggleCheck,
  onToggleAllVisible,
  onFocus,
}: CollectionPaneProps): React.JSX.Element {
  if (scope.kind === "archive") {
    return (
      <div className="p-4">
        <h2 className="mb-3 text-sm font-medium text-ink-strong">归档区</h2>
        <ArchivePanel archived={archived} />
      </div>
    );
  }
  if (scope.kind === "report") {
    return (
      <div className="p-4">
        <h2 className="mb-2 text-sm font-medium text-ink-strong">报告(四检)</h2>
        <p className="text-sm text-ink-mid">四检报告入口将在后续批次落地。可先用终端 <code className="font-mono text-xs">skills-hub verify</code> / <code className="font-mono text-xs">skills-hub doctor</code>。</p>
      </div>
    );
  }

  if (!isSkillScope(scope)) return <div />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-3 border-b border-line p-4">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="搜索名称 / 描述…"
          className={inputClass}
        />
        <select value={sortMode} onChange={(e) => onSortMode(e.target.value as SortMode)} className={selectClass}>
          <option value="name">按名称</option>
          <option value="usage">按调用次数</option>
        </select>
      </div>
      <SelectAllRow
        visibleHashes={skills.map((s) => s.hash)}
        checked={checked}
        onToggleAll={onToggleAllVisible}
      />
      {skills.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-mid">没有匹配的 skill。</p>
      ) : (
        <ul>
          {skills.map((skill) => (
            <SkillRow
              key={skill.hash}
              skill={skill}
              clientTotal={clientTotal}
              checked={checked.has(skill.hash)}
              focused={focusedHash === skill.hash}
              onToggleCheck={onToggleCheck}
              onFocus={onFocus}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
