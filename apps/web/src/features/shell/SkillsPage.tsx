import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { tabTriggerClass } from "@/components/ui/tabs";
import { getAction } from "../actions/registry.js";
import { AdoptForm } from "../panel/AdoptForm.js";
import { CreateForm } from "../panel/CreateForm.js";
import { fallbackClientState } from "../panel/client-view.js";
import { VirtualSkillList } from "../panel/VirtualSkillList.js";
import { ArchivePanel } from "../skills/ArchivePanel.js";
import { formatBatchResult } from "../skills/batch-links.js";
import { ALL_GROUP, applyFilters } from "../skills/filters.js";
import { GroupManager } from "../skills/GroupManager.js";
import { SkillActions } from "../skills/SkillActions.js";
import { SkillViewer } from "../skills/SkillViewer.js";
import type { ArchivedSkill, ClientInfo, ClientSkillStatesResponse, GroupDef, SkillRecord } from "../skills/types.js";
import { appsCoverageHint, enabledCountForClient, sortClientsForApps } from "./apps-layout.js";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { SkillsTab } from "./page.js";

interface SkillsPageProps {
  tab: SkillsTab;
  onTab: (tab: SkillsTab) => void;
  skills: SkillRecord[];
  clients: ClientInfo[];
  groups: GroupDef[];
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
  onArchive: (hash: string) => void;
  onGroupsChanged: () => void;
  onNotice: (text: string) => void;
  onBulkDone: () => void;
}

/** Skills 管理:应用 / 内容两个全幅 tab。 */
export function SkillsPage({
  tab,
  onTab,
  skills,
  clients,
  groups,
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
  onArchive,
  onGroupsChanged,
  onNotice,
  onBulkDone,
}: SkillsPageProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState(ALL_GROUP);
  const [showArchive, setShowArchive] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: "enable" | "disable";
    clientIds: string[];
    add: number;
    remove: number;
    conflicts: number;
  } | null>(null);
  const listed = useMemo(
    () => applyFilters(skills, groups, { query, sourceKind: "all", groupId }),
    [skills, groups, query, groupId],
  );
  const orderedClients = useMemo(() => sortClientsForApps(clients, skills), [clients, skills]);
  const focused = focusedHash === null ? null : (skills.find((s) => s.hash === focusedHash) ?? null);
  const clientId = selectedClientId ?? orderedClients[0]?.clientId ?? null;
  const allClientIds = orderedClients.map((c) => c.clientId);
  const allHashes = skills.map((s) => s.hash);
  const enabledHere = clientId === null
    ? 0
    : (clientStates?.clientId === clientId ? clientStates.enabled : enabledCountForClient(skills, clientId));

  const startBulk = async (action: "enable" | "disable", clientIds: string[]): Promise<void> => {
    if (allHashes.length === 0 || clientIds.length === 0) {
      onNotice("没有可操作的 skill 或应用。");
      return;
    }
    setBulkBusy(true);
    try {
      const preview = await getAction("preview-links").execute({ hashes: allHashes, clientIds, action });
      const n = action === "enable" ? preview.add : preview.remove;
      if (n === 0) {
        onNotice(
          preview.conflictCount > 0
            ? "没有可变更的项（" + String(preview.conflictCount) + " 处被本地目录占用）"
            : "没有需要变更的项",
        );
        return;
      }
      setConfirm({
        action,
        clientIds,
        add: preview.add,
        remove: preview.remove,
        conflicts: preview.conflictCount,
      });
    } catch (e) {
      onNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const runConfirmedBulk = async (): Promise<void> => {
    if (confirm === null) return;
    setBulkBusy(true);
    try {
      const result = await getAction("apply-clean-links").execute({
        hashes: allHashes,
        clientIds: confirm.clientIds,
        action: confirm.action,
      });
      setConfirm(null);
      onNotice(formatBatchResult(confirm.action, result.created.length, result.removed.length, result.skipped));
      onBulkDone();
    } catch (e) {
      onNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-6 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">Skills 管理</h1>
        <nav className="mt-3 flex" aria-label="Skills 管理页签">
          <button type="button" data-testid="skills-tab-apps" className={tabTriggerClass(tab === "apps")} onClick={() => onTab("apps")}>
            应用
          </button>
          <button type="button" data-testid="skills-tab-content" className={tabTriggerClass(tab === "content")} onClick={() => onTab("content")}>
            内容
          </button>
        </nav>
      </header>

      {tab === "apps" && (
        <div className="flex min-h-0 flex-1">
          <div className="w-48 shrink-0 overflow-y-auto border-r border-line py-2">
            {orderedClients.length === 0 && <p className="px-4 py-3 text-sm text-ink-mid">未发现应用</p>}
            {orderedClients.map((c) => (
              <button
                key={c.clientId}
                type="button"
                onClick={() => onSelectClient(c.clientId)}
                className={
                  "flex w-full px-4 py-2 text-left text-sm transition-colors duration-[150ms] " +
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
                  <p className="mt-1 text-xs text-ink-mid">{appsCoverageHint(enabledHere, skills.length)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid="bulk-enable-client"
                      disabled={bulkBusy}
                      onClick={() => void startBulk("enable", [clientId])}
                    >
                      全部启用
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      data-testid="bulk-disable-client"
                      disabled={bulkBusy || enabledHere === 0}
                      onClick={() => void startBulk("disable", [clientId])}
                    >
                      全部停用
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="bulk-enable-all"
                      disabled={bulkBusy || allClientIds.length === 0}
                      onClick={() => void startBulk("enable", allClientIds)}
                    >
                      启用到全部应用
                    </Button>
                  </div>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索名称 / 描述…"
                    data-testid="apps-skill-search"
                    className="mt-3"
                  />
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
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 描述…"
              className="min-w-48 flex-1"
            />
            <NativeSelect
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-label="按分组过滤"
              className="w-40"
            >
              <option value={ALL_GROUP}>全部分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </NativeSelect>
            <GroupManager groups={groups} onChanged={onGroupsChanged} onNotice={onNotice} />
            <AdoptForm clientIds={allClientIds} onDone={onAdopted} onNotice={onNotice} />
            <CreateForm clientIds={allClientIds} onDone={onAdopted} onNotice={onNotice} />
          </div>
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
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {focused === null ? (
                <p className="px-6 py-6 text-sm text-ink-mid">从左侧选一个 skill 查看内容。</p>
              ) : (
                <>
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2">
                    <p className="truncate text-sm font-medium text-ink-strong">{focused.dirName}</p>
                    <SkillActions
                      key={focused.hash}
                      skill={focused}
                      groups={groups}
                      onArchive={onArchive}
                      onGroupsChanged={onGroupsChanged}
                      onNotice={onNotice}
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <SkillViewer key={focused.hash} hash={focused.hash} onSaved={onSaved} />
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-line px-4 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowArchive((v) => !v)}>
              {showArchive ? "收起归档" : "归档区"}
            </Button>
            {showArchive && (
              <div className="mt-2">
                <ArchivePanel archived={archived} onRestore={onRestore} />
              </div>
            )}
          </div>
        </div>
      )}
      {confirm !== null && (
        <ConfirmDialog
          title={confirm.action === "enable" ? "全部启用" : "全部停用"}
          body={
            confirm.action === "enable"
              ? "将新增 " + String(confirm.add) + " 条链接到 " + (confirm.clientIds.length === 1 ? confirm.clientIds[0]! : String(confirm.clientIds.length) + " 个应用") +
                (confirm.conflicts > 0 ? "。" + String(confirm.conflicts) + " 处已被本地目录占用，不会覆盖。" : "。") +
                "磁盘会立刻改掉；正在运行的应用可能仍要新开对话。"
              : "将从 " + (confirm.clientIds.length === 1 ? confirm.clientIds[0]! : String(confirm.clientIds.length) + " 个应用") +
                " 摘掉 " + String(confirm.remove) + " 条受管链接。库存原件保留。"
          }
          confirmLabel={confirm.action === "enable" ? "启用" : "停用"}
          tone={confirm.action === "disable" ? "danger" : "default"}
          busy={bulkBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runConfirmedBulk()}
        />
      )}
    </div>
  );
}
