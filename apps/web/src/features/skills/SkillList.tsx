import type { ClientInfo, SkillRecord } from "./types.js";
import { SkillCard } from "./SkillCard.js";

interface SkillListProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  /** 正在执行写操作的 skill 哈希(其卡片显示进行态,禁止重复提交) */
  pendingHash: string | null;
  /** 失败原因(展示在对应卡片内) */
  errors: Map<string, string>;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
}

export function SkillList({ skills, clients, pendingHash, errors, onToggle }: SkillListProps): React.JSX.Element {
  if (skills.length === 0) {
    return <p className="text-sm text-ink-mid">没有匹配的 skill。</p>;
  }
  return (
    <ul className="space-y-3">
      {skills.map((skill) => (
        <SkillCard
          key={skill.hash}
          skill={skill}
          clients={clients}
          pending={pendingHash === skill.hash}
          error={errors.get(skill.hash) ?? null}
          onToggle={(clientId, enable) => onToggle(skill, clientId, enable)}
        />
      ))}
    </ul>
  );
}
