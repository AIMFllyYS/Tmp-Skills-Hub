import { useState } from "react";
import { Button } from "@/components/ui/button";
import { tabTriggerClass } from "@/components/ui/tabs";
import type { ClientInfo, SkillRecord, UsageCounters, UsageRankEntry } from "../skills/types.js";
import type { AppPage, StatsTab } from "./page.js";
import { appDistribution, sourceDistribution, usageRows } from "./stats-model.js";

interface StatsPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  ranking: UsageRankEntry[];
  counters: Map<string, UsageCounters>;
  onGo: (page: AppPage) => void;
}

function Bar({ value, max }: { value: number; max: number }): React.JSX.Element {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-2 flex-1 rounded-full bg-surface">
      <div className="h-2 rounded-full bg-ink-strong" style={{ width: String(pct) + "%" }} />
    </div>
  );
}

function Empty({ onGo }: { onGo: (page: AppPage) => void }): React.JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-mid">还没有可展示的数据。</p>
      <Button type="button" variant="outline" onClick={() => onGo("overview")}>
        回总览
      </Button>
    </div>
  );
}

/** 定量页:用量 / 应用分布 / 来源。 */
export function StatsPage({ skills, clients, ranking, counters, onGo }: StatsPageProps): React.JSX.Element {
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
        <button type="button" data-testid="stats-tab-usage" className={tabTriggerClass(tab === "usage")} onClick={() => setTab("usage")}>
          用量
        </button>
        <button type="button" data-testid="stats-tab-apps" className={tabTriggerClass(tab === "apps")} onClick={() => setTab("apps")}>
          应用分布
        </button>
        {sources.length > 0 && (
          <button type="button" data-testid="stats-tab-sources" className={tabTriggerClass(tab === "sources")} onClick={() => setTab("sources")}>
            来源
          </button>
        )}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {tab === "usage" && (
          usage.length === 0 ? <Empty onGo={onGo} /> : (
            <ul className="space-y-3">
              {usage.map((row) => (
                <li key={row.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-ink-strong">{row.name}</span>
                  <Bar value={row.total} max={usageMax} />
                  <span className="w-16 shrink-0 text-right text-xs text-ink-mid">{row.total}</span>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "apps" && (
          apps.length === 0 ? <Empty onGo={onGo} /> : (
            <ul className="space-y-3">
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
          )
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
