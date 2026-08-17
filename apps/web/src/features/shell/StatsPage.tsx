import { useState } from "react";
import type { ClientInfo, SkillRecord, UsageCounters } from "../skills/types.js";
import type { StatsTab } from "./page.js";
import { appDistribution, sourceDistribution, usageRows } from "./stats-model.js";

interface StatsPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  ranking: { hash: string; total: number; show: number; enable: number }[];
  counters: Map<string, UsageCounters>;
}

function tabClass(active: boolean): string {
  return (
    "px-3 py-2 text-sm transition-colors duration-150 " +
    (active ? "border-b border-ink-strong text-ink-strong" : "text-ink-mid hover:text-ink-strong")
  );
}

function Bar({ value, max }: { value: number; max: number }): React.JSX.Element {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-2 flex-1 rounded-full bg-surface">
      <div className="h-2 rounded-full bg-ink-strong" style={{ width: String(pct) + "%" }} />
    </div>
  );
}

/** 定量页:用量 / 应用分布 / 来源。 */
export function StatsPage({ skills, clients, ranking, counters }: StatsPageProps): React.JSX.Element {
  const [tab, setTab] = useState<StatsTab>("usage");
  const usage = usageRows(skills, ranking, counters);
  const apps = appDistribution(skills, clients);
  const sources = sourceDistribution(skills);
  const usageMax = usage.reduce((m, r) => Math.max(m, r.total), 0);
  const appMax = apps.reduce((m, r) => Math.max(m, r.enabled), 0);
  const sourceMax = sources.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">统计</h1>
        <p className="mt-1 text-sm text-ink-mid">本机用量与各应用的分布。</p>
      </header>
      <nav className="flex shrink-0 border-b border-line px-4" aria-label="统计页签">
        <button type="button" data-testid="stats-tab-usage" className={tabClass(tab === "usage")} onClick={() => setTab("usage")}>
          用量
        </button>
        <button type="button" data-testid="stats-tab-apps" className={tabClass(tab === "apps")} onClick={() => setTab("apps")}>
          应用分布
        </button>
        {sources.length > 0 && (
          <button type="button" data-testid="stats-tab-sources" className={tabClass(tab === "sources")} onClick={() => setTab("sources")}>
            来源
          </button>
        )}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === "usage" && (
          <ul className="space-y-3">
            {usage.length === 0 && <li className="text-sm text-ink-mid">还没有调用记录。</li>}
            {usage.map((row) => (
              <li key={row.name} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink-strong">{row.name}</span>
                <Bar value={row.total} max={usageMax} />
                <span className="w-16 shrink-0 text-right text-xs text-ink-mid">{row.total}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === "apps" && (
          <ul className="space-y-3">
            {apps.length === 0 && <li className="text-sm text-ink-mid">未发现应用。</li>}
            {apps.map((row) => (
              <li key={row.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink-strong">{row.id}</span>
                <Bar value={row.enabled} max={appMax} />
                <span className="w-20 shrink-0 text-right text-xs text-ink-mid">
                  {row.enabled}/{row.total}
                </span>
              </li>
            ))}
          </ul>
        )}
        {tab === "sources" && (
          <ul className="space-y-3">
            {sources.map((row) => (
              <li key={row.kind} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-ink-strong">{row.kind}</span>
                <Bar value={row.count} max={sourceMax} />
                <span className="w-16 shrink-0 text-right text-xs text-ink-mid">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
