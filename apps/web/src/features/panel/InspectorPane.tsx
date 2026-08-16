import { ClientSwitches } from "../skills/ClientSwitches.js";
import { SkillViewer } from "../skills/SkillViewer.js";
import type { ClientInfo, SkillRecord, UsageCounters } from "../skills/types.js";

interface InspectorPaneProps {
  skill: SkillRecord | null;
  clients: ClientInfo[];
  usage: UsageCounters | undefined;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
  onSaved: (oldHash: string, newHash: string) => void;
}

/** 检查器:当前选中 skill 的元信息、正文、客户端开关;未选中为空状态。 */
export function InspectorPane({
  skill,
  clients,
  usage,
  pending,
  error,
  onClose,
  onToggle,
  onSaved,
}: InspectorPaneProps): React.JSX.Element {
  if (skill === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-ink-mid">选择一个 skill 查看详情</p>
      </div>
    );
  }
  const origins = skill.origins.map((o) => o.kind).join(" / ");
  const total = (usage?.show ?? 0) + (usage?.enable ?? 0);
  return (
    <div className="flex min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-ink-strong">{skill.dirName}</h2>
            <p className="mt-1 text-sm text-ink-mid">{skill.meta.description}</p>
            <p className="mt-2 font-mono text-xs text-ink-faint">{skill.hash.slice(0, 12)}</p>
            <p className="mt-1 text-xs text-ink-mid">
              {origins || "无来源"} · {total} 次调用 · {skill.visibleIn.length}/{clients.length} 客户端
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-xs text-ink-mid hover:text-ink-strong">
            关闭
          </button>
        </div>
      </header>
      {error !== null && <p className="px-4 pt-3 text-xs text-red-700">{error}</p>}
      <SkillViewer key={skill.hash} hash={skill.hash} onSaved={onSaved} />
      <div className="border-t border-line pt-3">
        <h3 className="px-4 pb-2 text-xs font-medium text-ink-strong">客户端</h3>
        <ClientSwitches skill={skill} clients={clients} pending={pending} onToggle={onToggle} />
      </div>
    </div>
  );
}
