import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { BatchBar } from "./features/panel/BatchBar.js";
import { CollectionPane, type SortMode } from "./features/panel/CollectionPane.js";
import { fallbackClientState, filterByClientEnable, type ClientEnableFilter } from "./features/panel/client-view.js";
import { InspectorPane } from "./features/panel/InspectorPane.js";
import { emptySelection, selectionReducer } from "./features/panel/selection.js";
import { ScopeNav, scopeOptions } from "./features/panel/ScopeNav.js";
import { buildScopeCounts, isSkillScope, scopeKey, skillsForScope, type ScopeSelection } from "./features/panel/scope.js";
import { getAction } from "./features/actions/registry.js";
import { fetchArchive, fetchClientSkillStates, fetchClients, fetchGroups, fetchSkills, fetchStats } from "./features/skills/api.js";
import { fileResourceKey, invalidateResource, invalidateResourcePrefix, treeResourceKey } from "./features/skills/async-resource.js";
import { applyFilters, ALL_GROUP, ALL_SOURCE } from "./features/skills/filters.js";
import type { ArchivedSkill, ClientInfo, ClientSkillStatesResponse, GroupDef, SkillRecord, UsageCounters } from "./features/skills/types.js";

type LoadState = "loading" | "ready" | "offline";

export default function App() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [usageByHash, setUsageByHash] = useState<Map<string, UsageCounters>>(new Map());
  const [archived, setArchived] = useState<ArchivedSkill[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [scope, setScope] = useState<ScopeSelection>({ kind: "all" });
  const [enableFilter, setEnableFilter] = useState<ClientEnableFilter>("all");
  const [clientStates, setClientStates] = useState<ClientSkillStatesResponse | null>(null);
  const [focusedHash, setFocusedHash] = useState<string | null>(null);
  const [selection, dispatchSelection] = useReducer(selectionReducer, emptySelection);
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSkills(), fetchGroups(), fetchClients(), fetchStats(), fetchArchive()])
      .then(([s, g, c, st, ar]) => {
        if (cancelled) return;
        setSkills(s);
        setGroups(g);
        setClients(c);
        setUsageByHash(new Map(Object.entries(st.stats.counters)));
        setArchived(ar);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scope.kind !== "client" || scope.id === undefined) return;
    let cancelled = false;
    void fetchClientSkillStates(scope.id).then((s) => {
      if (!cancelled) setClientStates(s);
    }).catch(() => {
      if (!cancelled) setClientStates(null);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const handleToggle = useCallback(async (skill: SkillRecord, clientId: string, enable: boolean) => {
    setPendingHash(skill.hash);
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(skill.hash);
      return next;
    });
    try {
      await getAction(enable ? "enable" : "disable").execute({ hash: skill.hash, clientId });
      setSkills((prev) =>
        prev.map((s) => {
          if (s.hash !== skill.hash) return s;
          const visible = enable
            ? (s.visibleIn.includes(clientId) ? s.visibleIn : [...s.visibleIn, clientId])
            : s.visibleIn.filter((id) => id !== clientId);
          return { ...s, visibleIn: visible };
        }),
      );
      setClientStates((prev) => {
        if (prev === null || prev.clientId !== clientId) return prev;
        const rows = prev.rows.map((r) =>
          r.hash === skill.hash
            ? { ...r, state: enable ? "managed" as const : "off" as const, detail: enable ? "受管链接" : "未启用" }
            : r,
        );
        return { ...prev, rows, enabled: rows.filter((r) => r.state === "managed").length };
      });
      if (enable) {
        setUsageByHash((prev) => {
          const next = new Map(prev);
          const cur = next.get(skill.hash) ?? { show: 0, enable: 0 };
          next.set(skill.hash, { show: cur.show, enable: cur.enable + 1 });
          return next;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((prev) => new Map(prev).set(skill.hash, "操作失败: " + msg));
    } finally {
      setPendingHash(null);
    }
  }, []);

  const handleSaved = useCallback((oldHash: string, newHash: string) => {
    invalidateResource(treeResourceKey(oldHash));
    invalidateResourcePrefix(fileResourceKey(oldHash, ""));
    setSkills((prev) => prev.map((s) => (s.hash === oldHash ? { ...s, hash: newHash } : s)));
    setFocusedHash(newHash);
    dispatchSelection({ type: "replace-hash", from: oldHash, to: newHash });
  }, []);

  const handleScope = useCallback((next: ScopeSelection) => {
    setScope(next);
    setEnableFilter("all");
    if (!isSkillScope(next)) setFocusedHash(null);
  }, []);

  const handleToggleCheck = useCallback((hash: string, next: boolean) => {
    dispatchSelection({ type: "toggle", hash, next });
  }, []);

  const counts = useMemo(() => buildScopeCounts(skills, groups, clients, archived), [skills, groups, clients, archived]);
  const options = useMemo(() => scopeOptions(counts), [counts]);

  const visible = useMemo(() => {
    const scoped = skillsForScope(skills, groups, scope);
    const filtered = applyFilters(scoped, groups, { query, sourceKind: ALL_SOURCE, groupId: ALL_GROUP });
    if (sortMode === "usage") {
      const total = (s: SkillRecord) => {
        const u = usageByHash.get(s.hash);
        return (u?.show ?? 0) + (u?.enable ?? 0);
      };
      return [...filtered].sort((a, b) => total(b) - total(a) || a.dirName.localeCompare(b.dirName));
    }
    return [...filtered].sort((a, b) => a.dirName.localeCompare(b.dirName));
  }, [skills, groups, scope, query, sortMode, usageByHash]);

  const activeClientStates =
    scope.kind === "client" && clientStates !== null && clientStates.clientId === scope.id ? clientStates : null;

  const listed = useMemo(() => {
    if (scope.kind !== "client") return visible;
    const clientId = scope.id ?? "";
    const map = new Map((activeClientStates?.rows ?? []).map((r) => [r.hash, r.state]));
    return filterByClientEnable(visible, enableFilter, (hash) => {
      const hit = map.get(hash);
      if (hit !== undefined) return hit;
      const skill = visible.find((s) => s.hash === hash);
      return fallbackClientState(skill?.visibleIn ?? [], clientId);
    });
  }, [visible, scope, enableFilter, activeClientStates]);

  const handleToggleAllVisible = useCallback((next: boolean) => {
    dispatchSelection({ type: "toggle-visible", hashes: listed.map((s) => s.hash), next });
  }, [listed]);

  const handleSelectStore = useCallback(() => {
    dispatchSelection({ type: "select-store", hashes: skills.map((s) => s.hash) });
  }, [skills]);

  const handleBatchLink = useCallback(async (clientId: string, enable: boolean) => {
    const hashes = [...selection.hashes];
    if (hashes.length === 0) return;
    setBatchBusy(true);
    try {
      const params = { hashes, clientIds: [clientId], action: enable ? "enable" as const : "disable" as const };
      const preview = await getAction("preview-links").execute(params);
      if (preview.conflictCount > 0) {
        window.alert(
          "冲突 " + String(preview.conflictCount) + " 条，未执行。\n" +
          preview.conflicts.map((c) => c.dirName + ": " + c.reason).join("\n"),
        );
        return;
      }
      if (preview.add === 0 && preview.remove === 0) {
        window.alert("无变更");
        return;
      }
      if (!window.confirm("将新增 " + String(preview.add) + " 条 / 摘除 " + String(preview.remove) + " 条。确定？")) return;
      await getAction("apply-links").execute(params);
      const chosen = new Set(hashes);
      setSkills((prev) =>
        prev.map((s) => {
          if (!chosen.has(s.hash)) return s;
          const visible = enable
            ? (s.visibleIn.includes(clientId) ? s.visibleIn : [...s.visibleIn, clientId])
            : s.visibleIn.filter((id) => id !== clientId);
          return { ...s, visibleIn: visible };
        }),
      );
      setClientStates((prev) => {
        if (prev === null || prev.clientId !== clientId) return prev;
        const rows = prev.rows.map((r) =>
          chosen.has(r.hash)
            ? { ...r, state: enable ? "managed" as const : "off" as const, detail: enable ? "受管链接" : "未启用" }
            : r,
        );
        return { ...prev, rows, enabled: rows.filter((r) => r.state === "managed").length };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((prev) => {
        const next = new Map(prev);
        const first = hashes[0];
        if (first !== undefined) next.set(first, "批量操作失败: " + msg);
        return next;
      });
    } finally {
      setBatchBusy(false);
    }
  }, [selection.hashes]);

  const handleBatchArchive = useCallback(async () => {
    const hashes = [...selection.hashes];
    if (hashes.length === 0) return;
    if (!window.confirm("将归档 " + hashes.length + " 个 skill（软删除，可从归档区恢复）。确定？")) return;
    setBatchBusy(true);
    try {
      for (const hash of hashes) {
        await getAction("archive").execute({ hash });
      }
      const gone = new Set(hashes);
      setSkills((prev) => prev.filter((s) => !gone.has(s.hash)));
      if (focusedHash !== null && gone.has(focusedHash)) setFocusedHash(null);
      dispatchSelection({ type: "clear" });
      setArchived(await fetchArchive());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((prev) => {
        const next = new Map(prev);
        const first = hashes[0];
        if (first !== undefined) next.set(first, "归档失败: " + msg);
        return next;
      });
    } finally {
      setBatchBusy(false);
    }
  }, [selection.hashes, focusedHash]);

  const focused = focusedHash === null ? null : (skills.find((s) => s.hash === focusedHash) ?? null);
  const selectClass = "rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-line px-4 py-3 lg:px-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">skill-hub</h1>
            <p className="mt-1 text-sm text-ink-mid">社团内部的 Agent Skill 共享与统一管理中心</p>
          </div>
          <p className="shrink-0 text-xs text-ink-faint">
            {state === "ready" ? "库存 " + skills.length + " 个" : " "}
          </p>
        </div>
        <div className="mt-3 lg:hidden">
          <select
            className={selectClass + " w-full"}
            value={scopeKey(scope)}
            onChange={(e) => {
              const opt = options.find((o) => o.key === e.target.value);
              if (opt !== undefined) handleScope(opt.scope);
            }}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </header>

      {state === "offline" && (
        <p className="shrink-0 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未连接到本地数据服务。先运行 <code className="font-mono">skills-hub ui</code>
          (开发时:<code className="font-mono">pnpm dev:cli ui</code>),再刷新本页。
        </p>
      )}

      {state === "loading" && <p className="px-4 py-6 text-sm text-ink-mid">加载中…</p>}

      {state === "ready" && (
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-line lg:block">
            <ScopeNav counts={counts} selected={scope} onSelect={handleScope} />
          </aside>
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <CollectionPane
              scope={scope}
              query={query}
              onQuery={setQuery}
              sortMode={sortMode}
              onSortMode={setSortMode}
              skills={listed}
              archived={archived}
              clientTotal={clients.length}
              checked={selection.hashes}
              storeTotal={skills.length}
              focusedHash={focusedHash}
              onToggleCheck={handleToggleCheck}
              onToggleAllVisible={handleToggleAllVisible}
              onSelectStore={handleSelectStore}
              onAdopted={() => {
                void fetchSkills().then(setSkills);
              }}
              onFocus={setFocusedHash}
              clientView={
                scope.kind === "client" && scope.id !== undefined
                  ? {
                      clientId: scope.id,
                      skillsDir: activeClientStates?.skillsDir ?? clients.find((c) => c.clientId === scope.id)?.skillsDir ?? "",
                      enabled: activeClientStates?.enabled ?? skills.filter((s) => s.visibleIn.includes(scope.id ?? "")).length,
                      total: activeClientStates?.total ?? skills.length,
                      enableFilter,
                      onEnableFilter: setEnableFilter,
                      clientViewOf: (skill) => {
                        const row = activeClientStates?.rows.find((r) => r.hash === skill.hash);
                        const clientId = scope.id ?? "";
                        return {
                          state: row?.state ?? (skill.visibleIn.includes(clientId) ? "managed" : "off"),
                          detail: row?.detail ?? (skill.visibleIn.includes(clientId) ? "受管链接" : "未启用"),
                          pending: pendingHash === skill.hash,
                          onToggle: (en) => void handleToggle(skill, clientId, en),
                        };
                      },
                    }
                  : null
              }
            />
          </section>
          <aside
            className={
              "overflow-y-auto bg-white " +
              (focused === null
                ? "hidden w-[28rem] shrink-0 border-l border-line lg:block"
                : "fixed inset-0 z-10 lg:static lg:z-auto lg:w-[28rem] lg:shrink-0 lg:border-l lg:border-line")
            }
          >
            <InspectorPane
              skill={focused}
              clients={clients}
              usage={focused === null ? undefined : usageByHash.get(focused.hash)}
              pending={focused !== null && pendingHash === focused.hash}
              error={focused === null ? null : (errors.get(focused.hash) ?? null)}
              onClose={() => setFocusedHash(null)}
              onToggle={handleToggle}
              onSaved={handleSaved}
              onArchive={(s) => {
                if (!window.confirm("将归档 " + s.dirName + "（软删除，可从归档区恢复）。确定？")) return;
                void (async () => {
                  try {
                    await getAction("archive").execute({ hash: s.hash });
                    setSkills((prev) => prev.filter((x) => x.hash !== s.hash));
                    if (focusedHash === s.hash) setFocusedHash(null);
                    dispatchSelection({ type: "toggle", hash: s.hash, next: false });
                    setArchived(await fetchArchive());
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setErrors((prev) => new Map(prev).set(s.hash, "归档失败: " + msg));
                  }
                })();
              }}
            />
          </aside>
        </div>
      )}

      {state === "ready" && selection.hashes.size > 0 && (
        <BatchBar
          count={selection.hashes.size}
          clients={clients}
          busy={batchBusy}
          onClear={() => dispatchSelection({ type: "clear" })}
          onEnableTo={(id) => void handleBatchLink(id, true)}
          onDisableFrom={(id) => void handleBatchLink(id, false)}
          onArchive={() => void handleBatchArchive()}
          lockedClientId={scope.kind === "client" ? scope.id : undefined}
        />
      )}
    </div>
  );
}
