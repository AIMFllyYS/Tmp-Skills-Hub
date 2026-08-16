import { memo } from "react";
import { SKILL_ROW_HEIGHT_PX } from "../panel/virtual-window.js";
import type { SkillRecord } from "./types.js";

interface SkillRowProps {
  skill: SkillRecord;
  clientTotal: number;
  checked: boolean;
  focused: boolean;
  onToggleCheck: (hash: string, next: boolean) => void;
  onFocus: (hash: string) => void;
}

/** 集合列的一行:复选 + 名称 + 启用聚合(12/23) + 状态点。开关不在行上。 */
export const SkillRow = memo(function SkillRow({
  skill,
  clientTotal,
  checked,
  focused,
  onToggleCheck,
  onFocus,
}: SkillRowProps): React.JSX.Element {
  const on = skill.visibleIn.length;
  return (
    <li
      data-testid="skill-card"
      role="option"
      aria-selected={focused}
      className={"box-border overflow-hidden " + (focused ? "bg-surface" : "")}
      style={{ height: SKILL_ROW_HEIGHT_PX }}
    >
      <div className="flex h-full items-center gap-2 px-4">
        <input
          type="checkbox"
          checked={checked}
          aria-label={"选择 " + skill.dirName}
          onChange={(e) => onToggleCheck(skill.hash, e.target.checked)}
          className="shrink-0"
        />
        <button
          type="button"
          data-testid="skill-card-open"
          onClick={() => onFocus(skill.hash)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="truncate text-sm font-medium text-ink-strong">{skill.dirName}</span>
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-mid">
            {on}/{clientTotal}
            <span
              className={"inline-block h-1.5 w-1.5 rounded-full " + (on > 0 ? "bg-ink-strong" : "bg-line")}
              aria-hidden
            />
          </span>
        </button>
      </div>
    </li>
  );
});
