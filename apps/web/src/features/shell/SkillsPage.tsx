import { useMemo, useState } from "react";
import { AdoptForm } from "../panel/AdoptForm.js";
import { fallbackClientState } from "../panel/client-view.js";
import { VirtualSkillList } from "../panel/VirtualSkillList.js";
import { ArchivePanel } from "../skills/ArchivePanel.js";
import { SkillViewer } from "../skills/SkillViewer.js";
import type { ArchivedSkill, ClientInfo, ClientSkillStatesResponse, SkillRecord } from "../skills/types.js";
import type { SkillsTab } from "./page.js";

interface SkillsPageProps {
  tab: SkillsTab;
  onTab: (tab: SkillsTab) => void;
  skills: SkillRecord[];
  clients: ClientInfo[];
  archived: ArchivedSkill[];
  focusedHash: string | null;
  onFocus: (hash: string) => void;
  pendingHash: string | null;
  clientStates: ClientSkillStatesResponse | null;
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
  onSaved: (oldHash: string, newHash: string) => void;
  onAdopted: () => void;
  onRestore: (name: string) => void;
}

function tabClass(active: boolean): string {
  return (
    "px-3 py-2 text-sm transition-colors duration-150 " +
    (active ? "border-b border-ink-strong text-ink-strong" : "text-ink-mid hover:text-ink-strong")
  );
}

/** Skills 管理:应用 / 内容两个全幅 tab。 */
export function SkillsPage({
  tab,
  onTab,
  skills,
  clients,
  archived,
  focusedHash,
  onFocus,
  pendingHash,
  clientStates,
  selectedClientId,
  onSelectClient,
  onToggle,
  onSaved,
  onAdopted,
  onRestore,
}: SkillsPageProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q === ""
      ? skills
      : skills.filter((s) => s.dirName.toLowerCase().includes(q) || s.meta.description.toLowerCase().includes(q));
    return [...rows].sort((a, b) => a.dirName.localeCompare(b.dirName));
  }, [skills, query]);
  const focused = focusedHash === null ? null : (skills.find((s) => s.hash === focusedHash) ?? null);
  const clientId = selectedClientId ?? clients[0]?.clientId ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-6 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">Skills 管理</h1>
        <nav className="mt-3 flex" aria-label="Skills 管理页签">
          <button type="button" data-testid="skills-tab-apps" className={tabClass(tab === "apps")} onClick={() => onTab("apps")}>
            应用
          </button>
          <button type="button" data-testid="skills-tab-content" className={tabClass(tab === "content")} onClick={() => onTab("content")}>
            内容
          </button>
        </nav>
      </header>

      {tab === "apps" && (
        <div className="flex min-h-0 flex-1">
          <div className="w-48 shrink-0 overflow-y-auto border-r border-line py-2">
            {clients.length === 0 && <p className="px-4 py-3 text-sm text-ink-mid">未发现应用</p>}
            {clients.map((c) => (
              <button
                key={c.clientId}
                type="button"
                onClick={() => onSelectClient(c.clientId)}
                className={
                  "flex w-full px-4 py-2 text-left text-sm " +
                  (clientId === c.clientId ? "bg-surface text-ink-strong" : "text-ink-mid hover:bg-surface")
                }
              >
                {c.clientId}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {clientId === null ? (
              <p className="px-6 py-6 text-sm text-ink-mid">没有可管理的应用。</p>
            ) : (
              <>
                <div className="shrink-0 border-b border-line px-4 py-3">
                  <p className="text-sm font-medium text-ink-strong">{clientId}</p>
                  <p className="mt-1 text-xs text-ink-mid">
                    已启用 {clientStates?.clientId === clientId ? clientStates.enabled : skills.filter((s) => s.visibleIn.includes(clientId)).length}
                    {" / "}
                    {skills.length}
                  </p>
                </div>
                <VirtualSkillList
                  skills={listed}
                  clientTotal={clients.length}
                  checked={new Set()}
                  focusedHash={null}
                  onToggleCheck={() => undefined}
                  onFocus={() => undefined}
                  selectable={false}
                  clientViewOf={(skill) => {
                    const row = clientStates?.clientId === clientId
                      ? clientStates.rows.find((r) => r.hash === skill.hash)
                      : undefined;
                    const state = row?.state ?? fallbackClientState(skill.visibleIn, clientId);
                    return {
                      state,
                      detail: row?.detail ?? (state === "managed" ? "已启用" : "未启用"),
                      pending: pendingHash === skill.hash,
                      onToggle: (en) => onToggle(skill, clientId, en),
                    };
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-line px-4 py-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 描述…"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint"
            />
          </div>
          <AdoptForm onDone={onAdopted} />
          <div className="flex min-h-0 flex-1">
            <div className="flex w-64 shrink-0 flex-col border-r border-line">
              <VirtualSkillList
                skills={listed}
                clientTotal={clients.length}
                checked={new Set()}
                focusedHash={focusedHash}
                onToggleCheck={() => undefined}
                onFocus={onFocus}
                selectable={false}
              />
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {focused === null ? (
                <p className="px-6 py-6 text-sm text-ink-mid">从左侧选一个 skill 查看内容。</p>
              ) : (
                <SkillViewer key={focused.hash} hash={focused.hash} onSaved={onSaved} />
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-line px-4 py-2">
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              className="text-xs text-ink-mid hover:text-ink-strong"
            >
              {showArchive ? "收起归档" : "归档区"}
            </button>
            {showArchive && (
              <div className="mt-2">
                <ArchivePanel archived={archived} onRestore={onRestore} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
