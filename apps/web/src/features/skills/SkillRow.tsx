import { memo } from "react";
import { SKILL_ROW_HEIGHT_PX } from "../panel/virtual-window.js";
import type { ClientLinkState, SkillRecord } from "./types.js";

export interface SkillRowClientView {
  state: ClientLinkState;
  detail: string;
  pending: boolean;
  onToggle: (enable: boolean) => void;
}

interface SkillRowProps {
  skill: SkillRecord;
  clientTotal: number;
  checked: boolean;
  focused: boolean;
  onToggleCheck: (hash: string, next: boolean) => void;
  onFocus: (hash: string) => void;
  clientView?: SkillRowClientView | undefined;
  selectable?: boolean;
}

/** 集合列的一行:名称 + 启用聚合或该应用的开关。 */
export const SkillRow = memo(function SkillRow({
  skill,
  clientTotal,
  checked,
  focused,
  onToggleCheck,
  onFocus,
  clientView,
  selectable = true,
}: SkillRowProps): React.JSX.Element {
  const on = skill.visibleIn.length;
  const blocked = clientView !== undefined && (clientView.state === "unregistered-conflict" || clientView.state === "dangling");
  const enabled = clientView?.state === "managed";
  return (
    <li
      data-testid="skill-card"
      role="option"
      aria-selected={focused}
      className={
        "box-border overflow-hidden " +
        (checked ? "bg-surface " : "") +
        (focused ? "outline outline-1 outline-line-strong outline-offset-[-1px]" : "")
      }
      style={{ height: SKILL_ROW_HEIGHT_PX }}
    >
      <div className="flex h-full items-center gap-2 px-4">
        {selectable && (
          <input
            type="checkbox"
            checked={checked}
            aria-label={"选择 " + skill.dirName}
            onChange={(e) => onToggleCheck(skill.hash, e.target.checked)}
            className="shrink-0"
          />
        )}
        <button
          type="button"
          data-testid="skill-card-open"
          onClick={() => onFocus(skill.hash)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="truncate text-sm font-medium text-ink-strong">{skill.dirName}</span>
          {clientView === undefined ? (
            <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-mid">
              {on}/{clientTotal}
              <span
                className={"inline-block h-1.5 w-1.5 rounded-full " + (on > 0 ? "bg-ink-strong" : "bg-line")}
                aria-hidden
              />
            </span>
          ) : (
            <span className="shrink-0 text-xs text-ink-faint">{clientView.detail}</span>
          )}
        </button>
        {clientView !== undefined && (
          <button
            type="button"
            data-testid="client-switch"
            aria-pressed={enabled}
            disabled={clientView.pending || blocked}
            title={blocked ? clientView.detail : undefined}
            onClick={() => clientView.onToggle(!enabled)}
            className={[
              "shrink-0 rounded-full px-3 py-1 text-xs",
              enabled ? "bg-ink-strong text-white" : "border border-line bg-white text-ink-mid",
              clientView.pending || blocked ? "opacity-60" : "",
            ].join(" ")}
          >
            {blocked ? (clientView.state === "dangling" ? "悬空" : "占用") : enabled ? "已启用" : "未启用"}
          </button>
        )}
      </div>
    </li>
  );
});
