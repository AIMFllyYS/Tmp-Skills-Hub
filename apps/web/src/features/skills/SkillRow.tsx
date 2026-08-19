import { memo } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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
      className={cn(
        "box-border overflow-hidden",
        checked && "bg-surface",
        focused && "bg-surface outline outline-1 outline-offset-[-1px] outline-line-strong",
      )}
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
                className={cn("inline-block h-1.5 w-1.5 rounded-full", on > 0 ? "bg-ink-strong" : "bg-line")}
                aria-hidden
              />
            </span>
          ) : (
            <span className="shrink-0 text-xs text-ink-faint">{clientView.detail}</span>
          )}
        </button>
        {clientView !== undefined && (
          <Switch
            data-testid="client-switch"
            checked={enabled}
            disabled={clientView.pending || blocked}
            {...(blocked ? { title: clientView.detail } : {})}
            onCheckedChange={(next) => clientView.onToggle(next)}
            aria-label={blocked ? clientView.detail : enabled ? "已启用" : "未启用"}
          />
        )}
      </div>
    </li>
  );
});
