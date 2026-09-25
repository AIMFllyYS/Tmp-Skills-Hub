import { memo } from "react";
import { SourceGlyph } from "@/components/ui/source-glyph";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SKILL_ROW_HEIGHT_PX } from "./virtual-window.js";
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
  focused: boolean;
  onFocus: (hash: string) => void;
  clientView?: SkillRowClientView | undefined;
}

/** 集合列的一行:名称 + 启用聚合或该应用的开关。 */
export const SkillRow = memo(function SkillRow({
  skill,
  clientTotal,
  focused,
  onFocus,
  clientView,
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
        "relative box-border overflow-hidden motion-fill",
        focused && "bg-volt-soft/60 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-volt-fill",
      )}
      style={{ height: SKILL_ROW_HEIGHT_PX }}
    >
      <div className="flex h-full items-center gap-2 px-3">
        <button
          type="button"
          data-testid="skill-card-open"
          onClick={() => onFocus(skill.hash)}
          className="motion-row flex h-8 min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-1 text-left hover:bg-surface"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <SourceGlyph name={skill.dirName} kind={skill.origins[0]?.kind} size="sm" />
            <span className="truncate font-mono text-[13px] text-ink-strong">{skill.dirName}</span>
          </span>
          {clientView === undefined ? (
            <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-mid">
              {on}/{clientTotal}
              <span
                className={cn("inline-block h-1.5 w-1.5 rounded-full", on > 0 ? "bg-volt-fill ring-2 ring-volt-soft" : "bg-line-strong")}
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
