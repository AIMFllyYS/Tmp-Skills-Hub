import { useState } from "react";
import { getAction } from "../actions/registry.js";
import { isBuiltinGroup } from "./builtin-groups.js";
import { sameScope, type ScopeGroupCount, type ScopeSelection } from "./scope.js";

interface GroupSectionProps {
  groups: ScopeGroupCount[];
  selected: ScopeSelection;
  onSelect: (scope: ScopeSelection) => void;
  onCreate: (id: string, name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-line px-2 py-1 text-xs text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint";

/** 作用域列里的分组:点选过滤;＋新建;行菜单改名/删定义(不删 skill)。 */
export function GroupSection({
  groups,
  selected,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: GroupSectionProps): React.JSX.Element {
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const create = getAction("create-group");
  const rename = getAction("rename-group");
  const del = getAction("delete-group");

  return (
    <div>
      <p className="px-4 pb-1 pt-4 text-xs text-ink-faint">分组</p>
      {groups.length === 0 && !creating && <p className="px-4 py-1 text-xs text-ink-faint">暂无分组</p>}
      {groups.map((g) => (
        <div key={g.id} className="relative">
          {renameId === g.id ? (
            <form
              className="flex items-center gap-1 px-4 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                const name = renameValue.trim();
                if (name === "") return;
                onRename(g.id, name);
                setRenameId(null);
              }}
            >
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className={inputClass}
                autoFocus
              />
              <button type="submit" className="text-xs text-ink-mid hover:text-ink-strong">
                {rename.verb}
              </button>
              <button type="button" onClick={() => setRenameId(null)} className="text-xs text-ink-faint">
                取消
              </button>
            </form>
          ) : (
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => onSelect({ kind: "group", id: g.id })}
                className={
                  "flex min-w-0 flex-1 items-baseline justify-between gap-2 px-4 py-1.5 text-left text-sm " +
                  (sameScope(selected, { kind: "group", id: g.id })
                    ? "bg-surface text-ink-strong"
                    : "text-ink-mid hover:bg-surface hover:text-ink-strong")
                }
              >
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 font-mono text-xs text-ink-faint">{g.count}</span>
              </button>
              <button
                type="button"
                data-testid={"group-menu-" + g.id}
                aria-label={g.name + " 分组操作"}
                onClick={() => setMenuId((cur) => (cur === g.id ? null : g.id))}
                className="px-2 text-xs text-ink-faint hover:text-ink-mid"
              >
                ⋯
              </button>
            </div>
          )}
          {menuId === g.id && (
            <div className="absolute right-2 z-10 border border-line bg-white py-1">
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-xs text-ink-mid hover:bg-surface"
                onClick={() => {
                  setMenuId(null);
                  setRenameId(g.id);
                  setRenameValue(g.name);
                }}
              >
                {rename.verb}
              </button>
              {!isBuiltinGroup(g.id) && (
                <button
                  type="button"
                  className="block w-full px-3 py-1 text-left text-xs text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setMenuId(null);
                    if (!window.confirm("删除分组「" + g.name + "」？其中的 skill 仍在库存。")) return;
                    onDelete(g.id);
                  }}
                >
                  {del.verb}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {creating ? (
        <form
          className="flex flex-col gap-1 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = newId.trim();
            if (id === "") return;
            onCreate(id, newName.trim() === "" ? id : newName.trim());
            setCreating(false);
            setNewId("");
            setNewName("");
          }}
        >
          <input
            data-testid="group-create-id"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="id（小写字母开头）"
            className={inputClass}
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="显示名（可空）"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              data-testid="group-create-submit"
              className="rounded-full bg-ink-strong px-3 py-1 text-xs text-white"
            >
              {create.verb}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="text-xs text-ink-faint">
              取消
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          data-testid="group-create-open"
          onClick={() => setCreating(true)}
          className="px-4 py-1.5 text-left text-sm text-ink-mid hover:text-ink-strong"
        >
          ＋{create.verb}
        </button>
      )}
    </div>
  );
}
