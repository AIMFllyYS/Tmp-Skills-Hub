import { useState } from "react";
import { getAction } from "../actions/registry.js";
import type { ClientInfo } from "../skills/types.js";


interface BatchBarProps {
  count: number;
  clients: ClientInfo[];
  groups: { id: string; name: string }[];
  busy: boolean;
  onClear: () => void;
  onEnableTo: (clientId: string) => void;
  onDisableFrom: (clientId: string) => void;
  onAddToGroup: (groupId: string) => void;
  onArchive: () => void;
  /** 客户端视角:动作锁定到这一个 client,不再弹出菜单 */
  lockedClientId?: string | undefined;
}

function PickMenu({
  label,
  items,
  disabled,
  onPick,
}: {
  label: string;
  items: { id: string; name: string }[];
  disabled: boolean;
  onPick: (id: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || items.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong hover:text-ink-strong disabled:opacity-50"
      >
        {label}
      </button>
      {open && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 min-w-36 border border-line bg-white py-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-xs text-ink-mid hover:bg-surface hover:text-ink-strong"
                onClick={() => {
                  setOpen(false);
                  onPick(item.id);
                }}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 选中数 0→1 浮出的实体底栏:计数 + 动词动作 + 清除。无阴影/毛玻璃。 */
export function BatchBar({
  count,
  clients,
  groups,
  busy,
  onClear,
  onEnableTo,
  onDisableFrom,
  onAddToGroup,
  onArchive,
  lockedClientId,
}: BatchBarProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const enable = getAction("enable");
  const disable = getAction("disable");
  const archive = getAction("archive");
  const addToGroup = getAction("add-to-group");
  return (
    <div
      data-testid="batch-bar"
      className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-white px-4 py-2"
    >
      <span className="text-xs text-ink-mid">已选 {count} 项</span>
      {lockedClientId !== undefined ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onEnableTo(lockedClientId)}
            className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong"
          >
            {enable.verb}
          </button>
          <PickMenu
            label={addToGroup.verb + "…"}
            items={groups}
            disabled={busy || groups.length === 0}
            onPick={onAddToGroup}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onDisableFrom(lockedClientId)}
            className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong"
          >
            {disable.verb}
          </button>
        </>
      ) : (
        <>
          <PickMenu
            label={enable.verb + "到…"}
            items={clients.map((c) => ({ id: c.clientId, name: c.clientId }))}
            disabled={busy}
            onPick={onEnableTo}
          />
          <PickMenu
            label={addToGroup.verb + "…"}
            items={groups}
            disabled={busy || groups.length === 0}
            onPick={onAddToGroup}
          />
          <PickMenu
            label={disable.verb}
            items={clients.map((c) => ({ id: c.clientId, name: c.clientId }))}
            disabled={busy}
            onPick={onDisableFrom}
          />
        </>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong disabled:opacity-50"
          aria-label="更多动作"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute bottom-full left-0 z-20 mb-1 min-w-28 border border-line bg-white py-1">
            <div className="border-t border-line" />
            <button
              type="button"
              className="block w-full px-3 py-1 text-left text-xs text-red-700 hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false);
                onArchive();
              }}
            >
              {archive.verb}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onClear}
        className="ml-auto rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong hover:text-ink-strong"
      >
        清除
      </button>
    </div>
  );
}
