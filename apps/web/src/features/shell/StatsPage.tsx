import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, CHART_INK, CHART_SERIES } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tabTriggerClass } from "@/components/ui/tabs";
import type { ClientInfo, SkillRecord, UsageCounters, UsageRankEntry } from "../skills/types.js";
import type { ShellNav, StatsTab } from "./page.js";
import { appDistribution, sourceDistribution, usageRows } from "./stats-model.js";

interface StatsPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  ranking: UsageRankEntry[];
  counters: Map<string, UsageCounters>;
  onGo: (target: ShellNav) => void;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Empty({ onGo }: { onGo: (target: ShellNav) => void }): React.JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-mid">还没有可展示的数据。</p>
      <Button type="button" variant="outline" onClick={() => onGo({ page: "overview" })}>
        回总览
      </Button>
    </div>
  );
}

function UsageChart({
  rows,
  onSelect,
  tall = false,
}: {
  rows: { hash: string; name: string; total: number }[];
  onSelect: (hash: string) => void;
  tall?: boolean;
}): React.JSX.Element {
  const animate = !reducedMotion();
  return (
    <ChartContainer className={tall ? "h-[28rem]" : "h-64"}>
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} stroke={CHART_INK.line} />
        <XAxis
          type="number"
          tick={{ fill: CHART_INK.mid, fontSize: 12 }}
          axisLine={{ stroke: CHART_INK.line }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={112}
          tick={{ fill: CHART_INK.strong, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <ChartTooltip cursor={{ fill: CHART_INK.surface }} content={<ChartTooltipContent />} />
        <Bar
          dataKey="total"
          name="次数"
          fill={CHART_INK.strong}
          radius={4}
          isAnimationActive={animate}
          animationDuration={150}
          onClick={(d: unknown) => {
            if (typeof d !== "object" || d === null) return;
            const payload = (d as { payload?: { hash?: unknown } }).payload;
            if (payload !== undefined && typeof payload.hash === "string" && payload.hash !== "") {
              onSelect(payload.hash);
            }
          }}
        />
      </BarChart>
    </ChartContainer>
  );
}

function AppsChart({
  rows,
  onSelect,
  tall = false,
}: {
  rows: { id: string; enabled: number; total: number }[];
  onSelect: (id: string) => void;
  tall?: boolean;
}): React.JSX.Element {
  const animate = !reducedMotion();
  return (
    <ChartContainer className={tall ? "h-[28rem]" : "h-64"}>
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} stroke={CHART_INK.line} />
        <XAxis
          type="number"
          tick={{ fill: CHART_INK.mid, fontSize: 12 }}
          axisLine={{ stroke: CHART_INK.line }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="id"
          width={112}
          tick={{ fill: CHART_INK.strong, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <ChartTooltip cursor={{ fill: CHART_INK.surface }} content={<ChartTooltipContent />} />
        <Bar
          dataKey="enabled"
          name="已启用"
          fill={CHART_INK.strong}
          radius={4}
          isAnimationActive={animate}
          animationDuration={150}
          onClick={(d: unknown) => {
            if (typeof d !== "object" || d === null) return;
            const payload = (d as { payload?: { id?: unknown } }).payload;
            if (payload !== undefined && typeof payload.id === "string") onSelect(payload.id);
          }}
        />
        <Bar
          dataKey="total"
          name="库存"
          fill={CHART_INK.faint}
          radius={4}
          isAnimationActive={animate}
          animationDuration={150}
          onClick={(d: unknown) => {
            if (typeof d !== "object" || d === null) return;
            const payload = (d as { payload?: { id?: unknown } }).payload;
            if (payload !== undefined && typeof payload.id === "string") onSelect(payload.id);
          }}
        />
      </BarChart>
    </ChartContainer>
  );
}

function SourceChart({ rows }: { rows: { kind: string; count: number }[] }): React.JSX.Element {
  const animate = !reducedMotion();
  return (
    <ChartContainer>
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie
          data={rows}
          dataKey="count"
          nameKey="kind"
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={80}
          isAnimationActive={animate}
          animationDuration={150}
          label={(props) => {
            const name = "name" in props && typeof props.name === "string" ? props.name : "";
            const value = "value" in props ? String(props.value ?? "") : "";
            return name + " " + value;
          }}
        >
          {rows.map((row, i) => {
            const fill = CHART_SERIES[i % CHART_SERIES.length] ?? CHART_INK.strong;
            return <Cell key={row.kind} fill={fill} />;
          })}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/** 定量页:默认多图仪表盘，Tab 看大图。 */
export function StatsPage({ skills, clients, ranking, counters, onGo }: StatsPageProps): React.JSX.Element {
  const [tab, setTab] = useState<StatsTab>("overview");
  const usage = useMemo(() => usageRows(skills, ranking, counters), [skills, ranking, counters]);
  const apps = useMemo(() => appDistribution(skills, clients), [skills, clients]);
  const sources = useMemo(() => sourceDistribution(skills), [skills]);
  const dashUsage = usage.slice(0, 8);
  const noData = usage.length === 0 && apps.length === 0;

  const openSkill = (hash: string): void => {
    onGo({ page: "skills", tab: "content", hash });
  };
  const openApp = (id: string): void => {
    onGo({ page: "skills", tab: "apps", clientId: id });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">统计</h1>
        <p className="mt-1 text-sm text-ink-mid">本机用量与各应用的分布。</p>
      </header>
      <nav className="flex shrink-0 border-b border-line px-4" aria-label="统计页签">
        <button type="button" data-testid="stats-tab-overview" className={tabTriggerClass(tab === "overview")} onClick={() => setTab("overview")}>
          总览
        </button>
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {tab === "overview" && (
            noData ? <Empty onGo={onGo} /> : (
              <div className="grid gap-4 lg:grid-cols-2">
                {dashUsage.length > 0 && (
                  <Card>
                    <h2 className="text-base font-medium text-ink-strong">用量</h2>
                    <p className="mt-1 text-xs text-ink-mid">次数；点击进入该 skill。</p>
                    <UsageChart rows={dashUsage} onSelect={openSkill} />
                  </Card>
                )}
                {apps.length > 0 && (
                  <Card>
                    <h2 className="text-base font-medium text-ink-strong">应用分布</h2>
                    <p className="mt-1 text-xs text-ink-mid">已启用 / 库存；点击打开该应用。</p>
                    <AppsChart rows={apps} onSelect={openApp} />
                  </Card>
                )}
                {sources.length > 0 && (
                  <Card>
                    <h2 className="text-base font-medium text-ink-strong">来源</h2>
                    <p className="mt-1 text-xs text-ink-mid">有标记的收录来源。</p>
                    <SourceChart rows={sources} />
                  </Card>
                )}
              </div>
            )
          )}
          {tab === "usage" && (
            usage.length === 0 ? <Empty onGo={onGo} /> : (
              <Card>
                <h2 className="text-base font-medium text-ink-strong">用量</h2>
                <UsageChart rows={usage} onSelect={openSkill} tall />
              </Card>
            )
          )}
          {tab === "apps" && (
            apps.length === 0 ? <Empty onGo={onGo} /> : (
              <Card>
                <h2 className="text-base font-medium text-ink-strong">应用分布</h2>
                <AppsChart rows={apps} onSelect={openApp} tall />
              </Card>
            )
          )}
          {tab === "sources" && (
            sources.length === 0 ? <Empty onGo={onGo} /> : (
              <Card>
                <h2 className="text-base font-medium text-ink-strong">来源</h2>
                <SourceChart rows={sources} />
              </Card>
            )
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
