import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchArchive, fetchClients, fetchGroups, fetchSkills, fetchStats, setSkillEnabled } from "./features/skills/api.js";
import { ArchivePanel } from "./features/skills/ArchivePanel.js";
import { applyFilters, ALL_GROUP, ALL_SOURCE, sourceKindsOf } from "./features/skills/filters.js";
import { SkillList } from "./features/skills/SkillList.js";
import type { ArchivedSkill, ClientInfo, GroupDef, SkillRecord, UsageCounters } from "./features/skills/types.js";

type LoadState = "loading" | "ready" | "offline";
type SortMode = "name" | "usage";
type Tab = "skills" | "archive";

export default function App() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [usageByHash, setUsageByHash] = useState<Map<string, UsageCounters>>(new Map());
  const [archived, setArchived] = useState<ArchivedSkill[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [sourceKind, setSourceKind] = useState(ALL_SOURCE);
  const [groupId, setGroupId] = useState(ALL_GROUP);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [tab, setTab] = useState<Tab>("skills");
  /** 正在执行写操作的 skill 哈希 */
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  /** 失败原因,按 skill 哈希存(展示不静默) */
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchGroups(), fetchClients(), fetchStats(), fetchArchive()])
      .then(([s, g, c, st, ar]) => {
        setSkills(s);
        setGroups(g);
        setClients(c);
        setUsageByHash(new Map(Object.entries(st.stats.counters)));
        setArchived(ar);
        setState("ready");
      })
      .catch(() => setState("offline"));
  }, [reload]);

  /** 开关:enable/disable 写操作;进行中禁止重复提交;失败展示可读原因。 */
  const handleToggle = useCallback(async (skill: SkillRecord, clientId: string, enable: boolean) => {
    setPendingHash(skill.hash);
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(skill.hash);
      return next;
    });
    try {
      await setSkillEnabled(skill.hash, clientId, enable);
      // 成功后重新拉取:状态与磁盘实际链接一致,刷新不漂移
      setReload((n) => n + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((prev) => new Map(prev).set(skill.hash, "操作失败: " + msg));
    } finally {
      setPendingHash(null);
    }
  }, []);

  const sources = useMemo(() => sourceKindsOf(skills), [skills]);
  /** 过滤后按排序模式排列:name = dirName 升序;usage = 调用次数降序(零视为 0)。 */
  const visible = useMemo(() => {
    const filtered = applyFilters(skills, groups, { query, sourceKind, groupId });
    if (sortMode === "usage") {
      const total = (s: SkillRecord) => {
        const u = usageByHash.get(s.hash);
        return (u?.show ?? 0) + (u?.enable ?? 0);
      };
      return [...filtered].sort((a, b) => total(b) - total(a) || a.dirName.localeCompare(b.dirName));
    }
    return [...filtered].sort((a, b) => a.dirName.localeCompare(b.dirName));
  }, [skills, groups, query, sourceKind, groupId, sortMode, usageByHash]);
  const enabledCount = useMemo(() => skills.filter((s) => s.visibleIn.length > 0).length, [skills]);

  const selectClass = "rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong";
  const inputClass = "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint";
  const tabClass = (active: boolean) =>
    "rounded-full px-3 py-1 text-sm transition-colors duration-150 " + (active ? "bg-ink-strong text-white" : "text-ink-mid hover:bg-surface");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">skill-hub</h1>
        <p className="mt-1 text-sm text-ink-mid">社团内部的 Agent Skill 共享与统一管理中心</p>
        <p className="mt-1 text-xs text-ink-faint">
          {state === "ready" ? "库存 " + skills.length + " 个 · 已启用 " + enabledCount + " 个" : " "}
        </p>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <nav className="flex gap-1">
          <button type="button" className={tabClass(tab === "skills")} onClick={() => setTab("skills")}>技能</button>
          <button type="button" className={tabClass(tab === "archive")} onClick={() => setTab("archive")}>归档区</button>
        </nav>
      </div>

      {state === "loading" && <p className="text-sm text-ink-mid">加载中…</p>}

      {state === "offline" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未连接到本地数据服务。先运行 <code className="font-mono">skills-hub ui</code>
          (开发时:<code className="font-mono">pnpm dev:cli ui</code>),再刷新本页。
        </p>
      )}

      {state === "ready" && tab === "archive" && <ArchivePanel archived={archived} />}

      {state === "ready" && tab === "skills" && (
        <>
          <div className="mb-6 flex gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 描述…"
              className={inputClass}
            />
            <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value)} className={selectClass}>
              <option value={ALL_SOURCE}>全部来源</option>
              {sources.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectClass}>
              <option value={ALL_GROUP}>全部分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} className={selectClass}>
              <option value="name">按名称</option>
              <option value="usage">按调用次数</option>
            </select>
          </div>
          <SkillList
            skills={visible}
            clients={clients}
            usageByHash={usageByHash}
            pendingHash={pendingHash}
            errors={errors}
            onToggle={handleToggle}
            onSaved={() => setReload((n) => n + 1)}
          />
        </>
      )}
    </main>
  );
}
