import { useEffect, useState } from "react";
import { getAction } from "../actions/registry.js";
import { fetchSkillLinks } from "../skills/api.js";
import { ClientSwitches } from "../skills/ClientSwitches.js";
import { SkillViewer } from "../skills/SkillViewer.js";
import type { ClientInfo, ClientLinkRow, SkillRecord, UsageCounters } from "../skills/types.js";
import { AnalyzePanel } from "./AnalyzePanel.js";

type InspectorTab = "content" | "clients" | "analyze";

interface InspectorPaneProps {
  skill: SkillRecord | null;
  clients: ClientInfo[];
  usage: UsageCounters | undefined;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
  onSaved: (oldHash: string, newHash: string) => void;
  onArchive: (skill: SkillRecord) => void;
}

function tabClass(active: boolean): string {
  return (
    "px-3 py-2 text-xs transition-colors duration-150 " +
    (active ? "border-b border-ink-strong text-ink-strong" : "text-ink-mid hover:text-ink-strong")
  );
}

/** 检查器:头部 + 内容/客户端/分析页签 + 归档。未选中为空状态。 */
export function InspectorPane(props: InspectorPaneProps): React.JSX.Element {
  if (props.skill === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-ink-mid">选择一个 skill 查看详情</p>
      </div>
    );
  }
  return <InspectorBody key={props.skill.hash} {...props} skill={props.skill} />;
}

function InspectorBody({
  skill,
  clients,
  usage,
  pending,
  error,
  onClose,
  onToggle,
  onSaved,
  onArchive,
}: InspectorPaneProps & { skill: SkillRecord }): React.JSX.Element {
  const [tab, setTab] = useState<InspectorTab>("content");
  const [links, setLinks] = useState<ClientLinkRow[] | null>(null);

  useEffect(() => {
    if (tab !== "clients") return;
    let cancelled = false;
    void fetchSkillLinks(skill.hash).then((rows) => {
      if (!cancelled) setLinks(rows);
    }).catch(() => {
      if (!cancelled) setLinks([]);
    });
    return () => {
      cancelled = true;
    };
  }, [skill.hash, tab]);

  const origins = skill.origins.map((o) => o.kind).join(" / ");
  const total = (usage?.show ?? 0) + (usage?.enable ?? 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
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
      <nav className="flex shrink-0 border-b border-line px-2" aria-label="检查器页签">
        <button type="button" data-testid="inspector-tab-content" className={tabClass(tab === "content")} onClick={() => setTab("content")}>
          内容
        </button>
        <button type="button" data-testid="inspector-tab-clients" className={tabClass(tab === "clients")} onClick={() => setTab("clients")}>
          客户端
        </button>
        <button type="button" data-testid="inspector-tab-analyze" className={tabClass(tab === "analyze")} onClick={() => setTab("analyze")}>
          分析
        </button>
      </nav>
      {error !== null && <p className="shrink-0 px-4 pt-3 text-xs text-red-700">{error}</p>}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "content" && (
          <div className="h-full min-h-0 overflow-y-auto">
            <SkillViewer key={skill.hash} hash={skill.hash} onSaved={onSaved} />
          </div>
        )}
        {tab === "clients" && (
          <div className="h-full overflow-y-auto pt-3">
            <ClientSwitches skill={skill} clients={clients} links={links} pending={pending} onToggle={onToggle} />
          </div>
        )}
        {tab === "analyze" && (
          <div className="h-full overflow-y-auto">
            <AnalyzePanel target={skill.dirName} />
          </div>
        )}
      </div>
      <footer className="shrink-0 border-t border-line px-4 py-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onArchive(skill)}
          className="text-xs text-red-700 hover:underline disabled:opacity-50"
        >
          {getAction("archive").verb}此技能
        </button>
      </footer>
    </div>
  );
}
