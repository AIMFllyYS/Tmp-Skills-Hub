import { Archive, Blocks, Check, ChevronRight, Link2, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SourceGlyph } from "@/components/ui/source-glyph";
import { cn } from "@/lib/utils";
import type { ClientInfo, DoctorResponse, SkillRecord } from "../skills/types.js";
import type { ShellNav } from "./page.js";
import { coverageOf, recentSkills } from "./stats-model.js";

interface OverviewPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  doctor: DoctorResponse | null;
  snapshotCount: number;
  storeRoot?: string | null;
  onGo: (target: ShellNav) => void;
}

type Severity = "error" | "warn" | "info";

interface IssueItem {
  text: string;
  detail: string;
  severity: Severity;
  go: ShellNav;
}

const SEVERITY_DOT: Record<Severity, string> = {
  error: "bg-red-500",
  warn: "bg-amber-500",
  info: "bg-sky-400",
};

function MetricCard({
  title,
  value,
  unit,
  hint,
  icon: Icon,
  onClick,
  children,
}: {
  title: string;
  value: string;
  unit?: string;
  hint: string;
  icon: typeof Blocks;
  onClick: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-xl border border-line bg-card p-4 text-left shadow-card outline-none motion-press",
        "hover:border-line-strong hover:shadow-lift focus-visible:ring-2 focus-visible:ring-volt-fill/60",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-mid">{title}</span>
        <span className="flex size-7 items-center justify-center rounded-md bg-surface text-ink-faint motion-fill group-hover:bg-volt-soft group-hover:text-volt">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-strong tabular-nums">
        {value}
        {unit !== undefined && <span className="ml-1 text-base font-medium text-ink-faint">{unit}</span>}
      </p>
      {children}
      <p className="mt-auto pt-2 text-xs text-ink-faint">{hint}</p>
    </button>
  );
}

function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-line bg-card shadow-card", className)}>
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-sm font-medium text-ink-strong">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** 每个应用挂了多少个 skill(按 visibleIn),降序。 */
function appCoverage(skills: SkillRecord[], clients: ClientInfo[]): { clientId: string; linked: number }[] {
  const counts = new Map<string, number>(clients.map((c) => [c.clientId, 0]));
  for (const s of skills) for (const id of s.visibleIn) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([clientId, linked]) => ({ clientId, linked }))
    .sort((a, b) => b.linked - a.linked || a.clientId.localeCompare(b.clientId));
}

/** 一眼健康,不是第二份统计。 */
export function OverviewPage({
  skills,
  clients,
  doctor,
  snapshotCount,
  storeRoot = null,
  onGo,
}: OverviewPageProps): React.JSX.Element {
  const cover = coverageOf(skills);
  const coverPct = cover.total === 0 ? 0 : Math.round((cover.linked / cover.total) * 100);
  const dangling = doctor?.danglingLinks.length ?? 0;
  const unlinked = skills.filter((s) => s.visibleIn.length === 0).length;
  const issues: IssueItem[] = [];
  if (doctor !== null && (!doctor.store.resolved || !doctor.store.reachable)) {
    issues.push({ text: "库存不可达", detail: "检查库存路径是否存在", severity: "error", go: { settings: true } });
  }
  if (dangling > 0) {
    issues.push({
      text: "悬空链接 " + String(dangling) + " 条",
      detail: "链接指向的原件已不存在",
      severity: "warn",
      go: { page: "skills", tab: "apps" },
    });
  }
  if (unlinked > 0) {
    issues.push({
      text: String(unlinked) + " 个 skill 还没挂到任何应用",
      detail: "在 Skills 管理里可以一键启用",
      severity: "info",
      go: { page: "skills", tab: "apps" },
    });
  }
  if (snapshotCount === 0) {
    issues.push({ text: "还没有备份快照", detail: "重置前会自动建一份", severity: "info", go: { settings: true } });
  }
  const recent = recentSkills(skills, 6);
  const apps = appCoverage(skills, clients).slice(0, 6);
  const appMax = Math.max(1, ...apps.map((a) => a.linked));
  const empty = skills.length === 0;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto max-w-6xl px-8 py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">总览</h1>
            <p className="mt-1 truncate text-sm text-ink-mid">
              本机库存
              {storeRoot !== null && storeRoot !== "" && (
                <code className="ml-2 rounded-md bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-mid">{storeRoot}</code>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {empty ? (
              <Button type="button" variant="accent" onClick={() => onGo({ page: "skills", tab: "content" })}>
                去收录
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onGo({ page: "skills", tab: "content" })}>
                  去看内容
                </Button>
                <Button type="button" variant="accent" onClick={() => onGo({ page: "skills", tab: "apps" })}>
                  {unlinked > 0 ? "一键启用 " + String(unlinked) + " 个" : "管理应用"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="库存"
            value={String(skills.length)}
            unit="个"
            hint="按文件夹内容哈希去重"
            icon={Blocks}
            onClick={() => onGo({ page: "skills", tab: "content" })}
          />
          <MetricCard
            title="链接覆盖"
            value={String(coverPct)}
            unit="%"
            hint={String(cover.linked) + " / " + String(cover.total) + " 至少挂到一个应用"}
            icon={Link2}
            onClick={() => onGo({ page: "skills", tab: "apps" })}
          >
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
              <span className="block h-full rounded-full bg-volt-fill animate-bar-in" style={{ width: String(coverPct) + "%" }} />
            </span>
          </MetricCard>
          <MetricCard
            title="已发现应用"
            value={String(clients.length)}
            unit="个"
            hint="本机的 IDE / CLI 客户端"
            icon={Monitor}
            onClick={() => onGo({ page: "stats" })}
          />
          <MetricCard
            title="备份快照"
            value={String(snapshotCount)}
            unit="份"
            hint={snapshotCount === 0 ? "还没有快照" : "重置前可回滚"}
            icon={Archive}
            onClick={() => onGo({ settings: true })}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <SectionCard
            title="近期收录"
            className="lg:col-span-3"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={() => onGo({ page: "skills", tab: "content" })}>
                全部
                <ChevronRight className="size-3.5" aria-hidden />
              </Button>
            }
          >
            {recent.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-ink-mid">库存还是空的。</p>
            ) : (
              <ul className="px-2 pb-2">
                {recent.map((s) => (
                  <li key={s.hash}>
                    <button
                      type="button"
                      onClick={() => onGo({ page: "skills", tab: "content", hash: s.hash })}
                      className="group motion-row flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface"
                    >
                      <SourceGlyph name={s.dirName} kind={s.origins[0]?.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[13px] text-ink-strong">{s.dirName}</span>
                        <span className="block truncate text-xs text-ink-faint">{s.meta.description}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                          s.visibleIn.length > 0 ? "bg-volt-soft text-volt" : "bg-surface text-ink-faint",
                        )}
                      >
                        {s.visibleIn.length > 0 ? String(s.visibleIn.length) + " 个应用" : "未挂载"}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-faint opacity-0 motion-fill group-hover:opacity-100" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <SectionCard title="需要处理" action={issues.length > 0 ? <span className="font-mono text-xs text-ink-faint">{issues.length}</span> : undefined}>
              {issues.length === 0 ? (
                <div className="flex items-center gap-3 px-4 pb-4">
                  <span className="flex size-8 items-center justify-center rounded-full bg-volt-soft text-volt">
                    <Check className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink-strong">一切就绪</p>
                    <p className="text-xs text-ink-faint">没有需要立刻处理的事。</p>
                  </div>
                </div>
              ) : (
                <ul className="px-2 pb-2">
                  {issues.map((item) => (
                    <li key={item.text}>
                      <button
                        type="button"
                        onClick={() => onGo(item.go)}
                        className="group motion-row flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-surface"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", SEVERITY_DOT[item.severity])} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-ink-strong">{item.text}</span>
                          <span className="block text-xs text-ink-faint">{item.detail}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="各应用已启用">
              {apps.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-mid">还没有发现客户端目录。</p>
              ) : (
                <ul className="space-y-0.5 px-2 pb-2">
                  {apps.map((a) => (
                    <li key={a.clientId}>
                      <button
                        type="button"
                        onClick={() => onGo({ page: "skills", tab: "apps", clientId: a.clientId })}
                        className="motion-row grid w-full grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface"
                      >
                        <span className="truncate text-[13px] text-ink-mid">{a.clientId}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-volt-fill animate-bar-in"
                            style={{ width: String(Math.round((a.linked / appMax) * 100)) + "%" }}
                          />
                        </span>
                        <span className="text-right font-mono text-xs text-ink-strong tabular-nums">{a.linked}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
