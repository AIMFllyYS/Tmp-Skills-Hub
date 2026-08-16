import { useState } from "react";
import type { ClientInfo } from "../skills/types.js";

interface BatchBarProps {
  count: number;
  clients: ClientInfo[];
  busy: boolean;
  onClear: () => void;
  onEnableTo: (clientId: string) => void;
  onDisableFrom: (clientId: string) => void;
  onArchive: () => void;
}

function ClientMenu({
  label,
  clients,
  disabled,
  onPick,
}: {
  label: string;
  clients: ClientInfo[];
  disabled: boolean;
  onPick: (clientId: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || clients.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-mid hover:border-line-strong hover:text-ink-strong disabled:opacity-50"
      >
        {label}
      </button>
      {open && (
        <ul className="absolute bottom-full left-0 z-20 mb-1 min-w-36 border border-line bg-white py-1">
          {clients.map((c) => (
            <li key={c.clientId}>
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-xs text-ink-mid hover:bg-surface hover:text-ink-strong"
                onClick={() => {
                  setOpen(false);
                  onPick(c.clientId);
                }}
              >
                {c.clientId}
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
  busy,
  onClear,
  onEnableTo,
  onDisableFrom,
  onArchive,
}: BatchBarProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      data-testid="batch-bar"
      className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-white px-4 py-2"
    >
      <span className="text-xs text-ink-mid">已选 {count} 项</span>
      <ClientMenu label="启用到…" clients={clients} disabled={busy} onPick={onEnableTo} />
      <button
        type="button"
        disabled
        title="分组批量将在后续批次落地"
        className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-faint"
      >
        挂到分组…
      </button>
      <ClientMenu label="停用" clients={clients} disabled={busy} onPick={onDisableFrom} />
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
              归档
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
