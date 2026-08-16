import { useEffect, useMemo, useState } from "react";

interface SkillItem {
  hash: string;
  name: string;
  description: string;
  clientId: string;
}

type LoadState = "loading" | "ready" | "offline";

export default function App() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { skills: SkillItem[] }) => {
        setSkills(data.skills);
        setState("ready");
      })
      .catch(() => setState("offline"));
  }, []);

  const clients = useMemo(() => [...new Set(skills.map((s) => s.clientId))].sort(), [skills]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter(
      (s) =>
        (clientFilter === "all" || s.clientId === clientFilter) &&
        (q === "" || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    );
  }, [skills, query, clientFilter]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">skill-hub</h1>
        <p className="mt-1 text-sm text-gray-500">社团内部的 Agent Skill 共享与统一管理中心</p>
      </header>

      <div className="mb-6 flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 name / description…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">全部客户端</option>
          {clients.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {state === "loading" && <p className="text-sm text-gray-500">加载中…</p>}

      {state === "offline" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未连接到本地数据服务。先运行 <code className="font-mono">skills-hub ui</code>
          (开发时:<code className="font-mono">pnpm dev:cli ui</code>),再刷新本页。
        </p>
      )}

      {state === "ready" && (
        <ul className="space-y-3">
          {visible.map((skill) => (
            <li key={skill.hash} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-medium">{skill.name}</h2>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {skill.clientId}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{skill.description}</p>
              <p className="mt-2 font-mono text-xs text-gray-400">{skill.hash.slice(0, 12)}</p>
            </li>
          ))}
          {visible.length === 0 && <p className="text-sm text-gray-500">没有匹配的 skill。</p>}
        </ul>
      )}
    </main>
  );
}
