import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { SkillRow } from "../skills/SkillRow.js";
import type { SkillRecord } from "../skills/types.js";
import { ensureRowVisible, stepIndex, virtualWindow } from "./virtual-window.js";

interface VirtualSkillListProps {
  skills: SkillRecord[];
  clientTotal: number;
  checked: ReadonlySet<string>;
  focusedHash: string | null;
  onToggleCheck: (hash: string, next: boolean) => void;
  onFocus: (hash: string) => void;
}

/** 固定行高虚拟列表:只挂可见窗口 + overscan,选中态由数据驱动不随卸载丢失。 */
export function VirtualSkillList({
  skills,
  clientTotal,
  checked,
  focusedHash,
  onToggleCheck,
  onFocus,
}: VirtualSkillListProps): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) return;
    const measure = (): void => setViewport(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const win = virtualWindow(skills.length, scrollTop, viewport);
  const slice = skills.slice(win.start, win.end);

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollerRef.current;
    if (el === null) return;
    const next = ensureRowVisible(index, el.scrollTop, el.clientHeight);
    el.scrollTop = next;
    setScrollTop(next);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (skills.length === 0) return;
    const current = focusedHash === null ? null : skills.findIndex((s) => s.hash === focusedHash);
    const idx = current === -1 ? null : current;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = stepIndex(idx, 1, skills.length);
    else if (e.key === "ArrowUp") next = stepIndex(idx, -1, skills.length);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = skills.length - 1;
    if (next === null) return;
    e.preventDefault();
    const skill = skills[next];
    if (skill === undefined) return;
    onFocus(skill.hash);
    scrollToIndex(next);
  };

  return (
    <div
      ref={scrollerRef}
      data-testid="skill-virtual-list"
      tabIndex={0}
      role="listbox"
      aria-label="技能列表"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto outline-none"
    >
      <ul>
        {win.topPad > 0 && <li aria-hidden style={{ height: win.topPad }} />}
        {slice.map((skill) => (
          <SkillRow
            key={skill.hash}
            skill={skill}
            clientTotal={clientTotal}
            checked={checked.has(skill.hash)}
            focused={focusedHash === skill.hash}
            onToggleCheck={onToggleCheck}
            onFocus={onFocus}
          />
        ))}
        {win.bottomPad > 0 && <li aria-hidden style={{ height: win.bottomPad }} />}
      </ul>
    </div>
  );
}
