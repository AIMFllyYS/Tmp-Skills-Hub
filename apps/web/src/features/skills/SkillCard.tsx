import type { SkillRecord } from "./types.js";

/** 单个 skill 卡片:名称、描述、来源徽标、客户端可见性(语义不混用)。 */
export function SkillCard({ skill }: { skill: SkillRecord }): React.JSX.Element {
  const origins = skill.origins.map((o) => o.kind).join(" / ");
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-ink-strong">{skill.dirName}</h2>
        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-ink-mid">{origins}</span>
      </div>
      <p className="mt-1 text-sm text-ink-mid">{skill.meta.description}</p>
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="font-mono text-xs text-ink-faint">{skill.hash.slice(0, 12)}</p>
        <p className="text-xs text-ink-mid">
          {skill.visibleIn.length > 0 ? "可见于: " + skill.visibleIn.join(", ") : "未在客户端启用"}
        </p>
      </div>
    </li>
  );
}
