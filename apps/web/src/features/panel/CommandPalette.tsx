import { useMemo, useState } from "react";
import {
  actionNeedsClient,
  actionNeedsGroup,
  actionNeedsText,
  actionUnavailableReason,
  filterActions,
  type PaletteContext,
} from "../actions/command-filter.js";
import { getAction, listActions, type ActionId } from "../actions/registry.js";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  ctx: PaletteContext;
  clients: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  onRun: (id: ActionId, arg?: string) => void;
}

const inputClass =
  "w-full border-0 border-b border-line px-3 py-2 text-sm text-ink-strong outline-none placeholder:text-ink-faint";

/** ⌘K / Ctrl+K 命令面板:只枚举动作注册表,执行走同一套 getAction。无阴影/毛玻璃。 */
export function CommandPalette({
  open,
  onClose,
  ctx,
  clients,
  groups,
  onRun,
}: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [step, setStep] = useState<"list" | "text" | "client" | "group">("list");
  const [picked, setPicked] = useState<ActionId | null>(null);
  const [text, setText] = useState("");

  const actions = useMemo(() => filterActions(listActions(), query), [query]);

  if (!open) return null;

  const choose = (id: ActionId): void => {
    const reason = actionUnavailableReason(id, ctx);
    if (reason !== null) return;
    if (actionNeedsText(id)) {
      setPicked(id);
      setStep("text");
      return;
    }
    if (actionNeedsClient(id)) {
      if (clients.length === 1) {
        onRun(id, clients[0]!.id);
        onClose();
        return;
      }
      setPicked(id);
      setStep("client");
      return;
    }
    if (actionNeedsGroup(id)) {
      if (groups.length === 1) {
        onRun(id, groups[0]!.id);
        onClose();
        return;
      }
      setPicked(id);
      setStep("group");
      return;
    }
    onRun(id);
    onClose();
  };

  const submitText = (): void => {
    if (picked === null || text.trim() === "") return;
    onRun(picked, text.trim());
    onClose();
  };

  const picks = step === "client" ? clients : step === "group" ? groups : [];

  return (
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-30 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="w-[28rem] border border-line bg-white"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            if (step === "list") onClose();
            else setStep("list");
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const max = step === "list" ? actions.length : picks.length;
            setActive((i) => (max === 0 ? 0 : (i + 1) % max));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const max = step === "list" ? actions.length : picks.length;
            setActive((i) => (max === 0 ? 0 : (i - 1 + max) % max));
          }
          if (e.key === "Enter" && step === "list") {
            const hit = actions[active];
            if (hit !== undefined) choose(hit.id);
          }
          if (e.key === "Enter" && (step === "client" || step === "group")) {
            const hit = picks[active];
            if (hit !== undefined && picked !== null) {
              onRun(picked, hit.id);
              onClose();
            }
          }
        }}
      >
        {step === "list" && (
          <>
            <input
              autoFocus
              data-testid="command-palette-query"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="过滤动作…"
              className={inputClass}
            />
            <ul className="max-h-72 overflow-y-auto py-1">
              {actions.map((a, i) => {
                const reason = actionUnavailableReason(a.id, ctx);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={reason !== null}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(a.id)}
                      className={
                        "flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm " +
                        (reason !== null
                          ? "text-ink-faint"
                          : i === active
                            ? "bg-surface text-ink-strong"
                            : "text-ink-mid hover:bg-surface")
                      }
                    >
                      <span>{a.verb}</span>
                      <span className="font-mono text-xs text-ink-faint">{reason ?? a.id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {step === "text" && picked !== null && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText();
            }}
          >
            <p className="px-3 pt-2 text-xs text-ink-faint">{getAction(picked).verb}</p>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="参数"
              className={inputClass}
            />
          </form>
        )}
        {(step === "client" || step === "group") && (
          <ul className="max-h-72 overflow-y-auto py-1">
            {picks.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (picked !== null) {
                      onRun(picked, item.id);
                      onClose();
                    }
                  }}
                  className={
                    "block w-full px-3 py-1.5 text-left text-sm " +
                    (i === active ? "bg-surface text-ink-strong" : "text-ink-mid")
                  }
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
