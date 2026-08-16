import { GroupSection } from "./GroupSection.js";
import { sameScope, type ScopeCounts, type ScopeSelection } from "./scope.js";

interface ScopeNavProps {
  counts: ScopeCounts;
  selected: ScopeSelection;
  onSelect: (scope: ScopeSelection) => void;
  onCreateGroup: (id: string, name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
}

function Item({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-baseline justify-between gap-2 px-4 py-1.5 text-left text-sm transition-colors duration-150 " +
        (active ? "bg-surface text-ink-strong" : "text-ink-mid hover:bg-surface hover:text-ink-strong")
      }
    >
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 font-mono text-xs text-ink-faint">{count}</span>}
    </button>
  );
}

function Heading({ text }: { text: string }): React.JSX.Element {
  return <p className="px-4 pb-1 pt-4 text-xs text-ink-faint">{text}</p>;
}

/** 作用域列:全部 / 分组 / 客户端 / 来源 / 归档 / 报告。点选改变集合列范围。 */
export function ScopeNav({
  counts,
  selected,
  onSelect,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: ScopeNavProps): React.JSX.Element {
  return (
    <nav className="py-2" aria-label="作用域">
      <Item
        label="全部技能"
        count={counts.all}
        active={sameScope(selected, { kind: "all" })}
        onClick={() => onSelect({ kind: "all" })}
      />
      <GroupSection
        groups={counts.groups}
        selected={selected}
        onSelect={onSelect}
        onCreate={onCreateGroup}
        onRename={onRenameGroup}
        onDelete={onDeleteGroup}
      />
      <Heading text="客户端" />
      {counts.clients.length === 0 && <p className="px-4 py-1 text-xs text-ink-faint">未发现客户端</p>}
      {counts.clients.map((c) => (
        <Item
          key={c.id}
          label={c.id}
          count={c.count}
          active={sameScope(selected, { kind: "client", id: c.id })}
          onClick={() => onSelect({ kind: "client", id: c.id })}
        />
      ))}
      <Heading text="来源" />
      {counts.sources.length === 0 && <p className="px-4 py-1 text-xs text-ink-faint">无来源</p>}
      {counts.sources.map((s) => (
        <Item
          key={s.id}
          label={s.id}
          count={s.count}
          active={sameScope(selected, { kind: "source", id: s.id })}
          onClick={() => onSelect({ kind: "source", id: s.id })}
        />
      ))}
      <Heading text="其他" />
      <Item
        label="归档区"
        count={counts.archive}
        active={sameScope(selected, { kind: "archive" })}
        onClick={() => onSelect({ kind: "archive" })}
      />
      <Item
        label="报告(四检)"
        active={sameScope(selected, { kind: "report" })}
        onClick={() => onSelect({ kind: "report" })}
      />
    </nav>
  );
}

export interface ScopeOption {
  key: string;
  label: string;
  scope: ScopeSelection;
}

/** 窄屏作用域下拉的扁平选项(与 ScopeNav 同一份范围)。 */
export function scopeOptions(counts: ScopeCounts): ScopeOption[] {
  return [
    { key: "all", label: "全部技能 " + counts.all, scope: { kind: "all" } },
    ...counts.groups.map((g) => ({
      key: "group:" + g.id,
      label: "分组 · " + g.name + " " + g.count,
      scope: { kind: "group" as const, id: g.id },
    })),
    ...counts.clients.map((c) => ({
      key: "client:" + c.id,
      label: "客户端 · " + c.id + " " + c.count,
      scope: { kind: "client" as const, id: c.id },
    })),
    ...counts.sources.map((s) => ({
      key: "source:" + s.id,
      label: "来源 · " + s.id + " " + s.count,
      scope: { kind: "source" as const, id: s.id },
    })),
    { key: "archive", label: "归档区 " + counts.archive, scope: { kind: "archive" } },
    { key: "report", label: "报告(四检)", scope: { kind: "report" } },
  ];
}
