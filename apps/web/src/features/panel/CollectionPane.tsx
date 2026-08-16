import { useEffect, useRef } from "react";
import { ArchivePanel } from "../skills/ArchivePanel.js";
import type { SkillRowClientView } from "../skills/SkillRow.js";
import type { ArchivedSkill, SkillRecord } from "../skills/types.js";
import type { ClientEnableFilter } from "./client-view.js";
import { isSkillScope, scopeKey, type ScopeSelection } from "./scope.js";
import { masterCheckState, selectionSummary } from "./selection.js";
import { VirtualSkillList } from "./VirtualSkillList.js";

export type SortMode = "name" | "usage";
export type { ClientEnableFilter };

export interface ClientViewInfo {
  clientId: string;
  skillsDir: string;
  enabled: number;
  total: number;
  enableFilter: ClientEnableFilter;
  onEnableFilter: (f: ClientEnableFilter) => void;
  clientViewOf: (skill: SkillRecord) => SkillRowClientView | undefined;
}

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
  storeTotal: number;
  focusedHash: string | null;
  onToggleCheck: (hash: string, next: boolean) => void;
  onToggleAllVisible: (next: boolean) => void;
  onSelectStore: () => void;
  onFocus: (hash: string) => void;
  clientView: ClientViewInfo | null;
}

const inputClass =
  "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint";
const selectClass =
  "rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong";

function SelectAllRow({
  visibleHashes,
  checked,
  storeTotal,
  onToggleAll,
  onSelectStore,
}: {
  visibleHashes: string[];
  checked: ReadonlySet<string>;
  storeTotal: number;
  onToggleAll: (next: boolean) => void;
  onSelectStore: () => void;
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const master = masterCheckState(visibleHashes, checked);
  const summary = selectionSummary(visibleHashes, checked);
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = master === "some";
  }, [master]);
  const live =
    summary.hidden > 0
      ? "已选 " + summary.selected + " 项，其中 " + summary.hidden + " 项当前不可见"
      : "已选 " + summary.selected + " 项";
  const offerStore = master === "all" && storeTotal > visibleHashes.length;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-mid">
      <input
        ref={ref}
        type="checkbox"
        checked={master === "all"}
        disabled={visibleHashes.length === 0}
        aria-label="全选当前可见列表"
        onChange={(e) => onToggleAll(e.target.checked)}
      />
      <span>全选当前列表</span>
      <span aria-live="polite">{live}</span>
      {offerStore && (
        <button
          type="button"
          onClick={onSelectStore}
          className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong hover:text-ink-strong"
        >
          选中全部库存 {storeTotal} 项
        </button>
      )}
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
  storeTotal,
  focusedHash,
  onToggleCheck,
  onToggleAllVisible,
  onSelectStore,
  onFocus,
  clientView,
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
      {clientView !== null && (
        <div data-testid="client-view-header" className="shrink-0 border-b border-line px-4 py-2">
          <p className="text-sm font-medium text-ink-strong">{clientView.clientId}</p>
          <p className="font-mono text-xs text-ink-faint break-all">{clientView.skillsDir}</p>
          <p className="mt-1 text-xs text-ink-mid">已启用 {clientView.enabled} / {clientView.total}</p>
          <div className="mt-2 flex gap-2">
            {(["all", "on", "off"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => clientView.onEnableFilter(f)}
                className={
                  "rounded-full px-3 py-1 text-xs " +
                  (clientView.enableFilter === f ? "bg-ink-strong text-white" : "border border-line text-ink-mid")
                }
              >
                {f === "all" ? "全部" : f === "on" ? "只看已启用" : "只看未启用"}
              </button>
            ))}
          </div>
        </div>
      )}
      <SelectAllRow
        visibleHashes={skills.map((s) => s.hash)}
        checked={checked}
        storeTotal={storeTotal}
        onToggleAll={onToggleAllVisible}
        onSelectStore={onSelectStore}
      />
      {skills.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-mid">没有匹配的 skill。</p>
      ) : (
        <VirtualSkillList
          key={scopeKey(scope) + "\0" + query + "\0" + sortMode + "\0" + (clientView?.enableFilter ?? "all")}
          skills={skills}
          clientTotal={clientTotal}
          checked={checked}
          focusedHash={focusedHash}
          onToggleCheck={onToggleCheck}
          onFocus={onFocus}
          clientViewOf={clientView?.clientViewOf}
        />
      )}
    </div>
  );
}
