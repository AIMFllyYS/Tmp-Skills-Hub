import type { SkillRecord } from "./types.js";
import { SkillCard } from "./SkillCard.js";

export function SkillList({ skills }: { skills: SkillRecord[] }): React.JSX.Element {
  if (skills.length === 0) {
    return <p className="text-sm text-ink-mid">没有匹配的 skill。</p>;
  }
  return (
    <ul className="space-y-3">
      {skills.map((skill) => (
        <SkillCard key={skill.hash} skill={skill} />
      ))}
    </ul>
  );
}
