import { useCallback, useEffect, useMemo, useState } from "react";
import { CollectionPane, type SortMode } from "./features/panel/CollectionPane.js";
import { InspectorPane } from "./features/panel/InspectorPane.js";
import { ScopeNav, scopeOptions } from "./features/panel/ScopeNav.js";
import { buildScopeCounts, isSkillScope, scopeKey, skillsForScope, type ScopeSelection } from "./features/panel/scope.js";
import { fetchArchive, fetchClients, fetchGroups, fetchSkills, fetchStats, setSkillEnabled } from "./features/skills/api.js";
import { fileResourceKey, invalidateResource, invalidateResourcePrefix, treeResourceKey } from "./features/skills/async-resource.js";
import { applyFilters, ALL_GROUP, ALL_SOURCE } from "./features/skills/filters.js";
import type { ArchivedSkill, ClientInfo, GroupDef, SkillRecord, UsageCounters } from "./features/skills/types.js";

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
  const [focusedHash, setFocusedHash] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pendingHash, setPendingHash] = useState<string | null>(null);
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

  const handleToggle = useCallback(async (skill: SkillRecord, clientId: string, enable: boolean) => {
    setPendingHash(skill.hash);
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(skill.hash);
      return next;
    });
    try {
      await setSkillEnabled(skill.hash, clientId, enable);
      setSkills((prev) =>
        prev.map((s) => {
          if (s.hash !== skill.hash) return s;
          const visible = enable
            ? (s.visibleIn.includes(clientId) ? s.visibleIn : [...s.visibleIn, clientId])
            : s.visibleIn.filter((id) => id !== clientId);
          return { ...s, visibleIn: visible };
        }),
      );
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
    setChecked((prev) => {
      if (!prev.has(oldHash)) return prev;
      const next = new Set(prev);
      next.delete(oldHash);
      next.add(newHash);
      return next;
    });
  }, []);

  const handleScope = useCallback((next: ScopeSelection) => {
    setScope(next);
    if (!isSkillScope(next)) setFocusedHash(null);
  }, []);

  const handleToggleCheck = useCallback((hash: string, next: boolean) => {
    setChecked((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(hash);
      else copy.delete(hash);
      return copy;
    });
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

  const handleToggleAllVisible = useCallback((next: boolean) => {
    const hashes = visible.map((s) => s.hash);
    setChecked((prev) => {
      const copy = new Set(prev);
      for (const h of hashes) {
        if (next) copy.add(h);
        else copy.delete(h);
      }
      return copy;
    });
  }, [visible]);

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
              skills={visible}
              archived={archived}
              clientTotal={clients.length}
              checked={checked}
              focusedHash={focusedHash}
              onToggleCheck={handleToggleCheck}
              onToggleAllVisible={handleToggleAllVisible}
              onFocus={setFocusedHash}
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
            />
          </aside>
        </div>
      )}
    </div>
  );
}
