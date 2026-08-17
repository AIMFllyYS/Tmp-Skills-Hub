import type { ClientInfo, DoctorResponse, SkillRecord } from "../skills/types.js";
import type { AppPage, SkillsTab } from "./page.js";
import { coverageOf, recentSkills } from "./stats-model.js";

interface OverviewPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  doctor: DoctorResponse | null;
  snapshotCount: number;
  onGo: (page: AppPage, tab?: SkillsTab) => void;
}

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs text-ink-faint">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-strong">{value}</p>
      {hint !== undefined && <p className="mt-1 text-xs text-ink-mid">{hint}</p>}
    </div>
  );
}

/** 一眼健康,不是第二份统计。 */
export function OverviewPage({ skills, clients, doctor, snapshotCount, onGo }: OverviewPageProps): React.JSX.Element {
  const cover = coverageOf(skills);
  const dangling = doctor?.danglingLinks.length ?? 0;
  const issues: string[] = [];
  if (doctor !== null && (!doctor.store.resolved || !doctor.store.reachable)) issues.push("库存不可达");
  if (dangling > 0) issues.push("悬空链接 " + String(dangling) + " 条");
  if (snapshotCount === 0) issues.push("还没有备份快照");
  const recent = recentSkills(skills, 5);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">总览</h1>
      <p className="mt-1 text-sm text-ink-mid">本机技能库存的整体情况。</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card title="库存" value={String(skills.length)} hint="个 skill" />
        <Card
          title="覆盖"
          value={cover.total === 0 ? "0" : String(cover.linked) + "/" + String(cover.total)}
          hint="至少挂到一个应用"
        />
        <Card title="应用" value={String(clients.length)} hint="已发现的 IDE / CLI" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onGo("skills", "apps")}
          className="rounded-lg bg-ink-strong px-3 py-2 text-sm text-white"
        >
          去管应用
        </button>
        <button
          type="button"
          onClick={() => onGo("skills", "content")}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-strong hover:border-line-strong"
        >
          去看内容
        </button>
        <button
          type="button"
          onClick={() => onGo("settings")}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-strong hover:border-line-strong"
        >
          打开设置
        </button>
      </div>
      <section className="mt-8">
        <h2 className="text-base font-medium text-ink-strong">需要处理</h2>
        {issues.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mid">没有需要立刻处理的事。</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-ink-mid">
            {issues.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-base font-medium text-ink-strong">近期收录</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mid">库存还是空的。</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {recent.map((s) => (
              <li key={s.hash} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-ink-strong">{s.dirName}</span>
                <span className="text-xs text-ink-faint">
                  {s.visibleIn.length > 0 ? "已挂 " + String(s.visibleIn.length) + " 个应用" : "未挂到应用"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
