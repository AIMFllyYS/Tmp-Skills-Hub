import { useEffect, useMemo, useState } from "react";
import { fetchGroups, fetchSkills } from "./features/skills/api.js";
import { applyFilters, ALL_GROUP, ALL_SOURCE, sourceKindsOf } from "./features/skills/filters.js";
import { SkillList } from "./features/skills/SkillList.js";
import type { GroupDef, SkillRecord } from "./features/skills/types.js";

type LoadState = "loading" | "ready" | "offline";

export default function App() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [sourceKind, setSourceKind] = useState(ALL_SOURCE);
  const [groupId, setGroupId] = useState(ALL_GROUP);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchGroups()])
      .then(([s, g]) => {
        setSkills(s);
        setGroups(g);
        setState("ready");
      })
      .catch(() => setState("offline"));
  }, []);

  const sources = useMemo(() => sourceKindsOf(skills), [skills]);
  const visible = useMemo(() => applyFilters(skills, groups, { query, sourceKind, groupId }), [skills, groups, query, sourceKind, groupId]);
  const enabledCount = useMemo(() => skills.filter((s) => s.visibleIn.length > 0).length, [skills]);

  const selectClass = "rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong";
  const inputClass = "w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-strong outline-none focus:border-line-strong placeholder:text-ink-faint";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">skill-hub</h1>
        <p className="mt-1 text-sm text-ink-mid">社团内部的 Agent Skill 共享与统一管理中心</p>
        <p className="mt-1 text-xs text-ink-faint">
          {state === "ready" ? "库存 " + skills.length + " 个 · 已启用 " + enabledCount + " 个" : " "}
        </p>
      </header>

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
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectClass}>
          <option value={ALL_GROUP}>全部分组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {state === "loading" && <p className="text-sm text-ink-mid">加载中…</p>}

      {state === "offline" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未连接到本地数据服务。先运行 <code className="font-mono">skills-hub ui</code>
          (开发时:<code className="font-mono">pnpm dev:cli ui</code>),再刷新本页。
        </p>
      )}

      {state === "ready" && <SkillList skills={visible} />}
    </main>
  );
}
