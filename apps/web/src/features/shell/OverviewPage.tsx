import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
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

interface IssueItem {
  text: string;
  go: { page: AppPage; tab?: SkillsTab };
}

/** 一眼健康,不是第二份统计。 */
export function OverviewPage({ skills, clients, doctor, snapshotCount, onGo }: OverviewPageProps): React.JSX.Element {
  const cover = coverageOf(skills);
  const dangling = doctor?.danglingLinks.length ?? 0;
  const unlinked = skills.filter((s) => s.visibleIn.length === 0).length;
  const issues: IssueItem[] = [];
  if (doctor !== null && (!doctor.store.resolved || !doctor.store.reachable)) {
    issues.push({ text: "库存不可达", go: { page: "settings" } });
  }
  if (dangling > 0) {
    issues.push({ text: "悬空链接 " + String(dangling) + " 条", go: { page: "skills", tab: "apps" } });
  }
  if (unlinked > 0) {
    issues.push({
      text: String(unlinked) + " 个 skill 还没挂到任何应用，可在 Skills 管理里一键启用",
      go: { page: "skills", tab: "apps" },
    });
  }
  if (snapshotCount === 0) {
    issues.push({ text: "还没有备份快照", go: { page: "settings" } });
  }
  const recent = recentSkills(skills, 5);
  const empty = skills.length === 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">总览</h1>
      <p className="mt-1 text-sm text-ink-mid">本机技能库存的整体情况。</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>库存</CardTitle>
          <CardValue>{String(skills.length)}</CardValue>
          <p className="mt-1 text-xs text-ink-mid">个 skill</p>
        </Card>
        <Card>
          <CardTitle>覆盖</CardTitle>
          <CardValue>{cover.total === 0 ? "0" : String(cover.linked) + "/" + String(cover.total)}</CardValue>
          <p className="mt-1 text-xs text-ink-mid">至少挂到一个应用</p>
        </Card>
        <Card>
          <CardTitle>应用</CardTitle>
          <CardValue>{String(clients.length)}</CardValue>
          <p className="mt-1 text-xs text-ink-mid">已发现的 IDE / CLI</p>
        </Card>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {empty ? (
          <Button type="button" onClick={() => onGo("skills", "content")}>
            去收录
          </Button>
        ) : (
          <>
            <Button type="button" onClick={() => onGo("skills", "apps")}>
              {unlinked > 0 ? "去一键启用" : "去管应用"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onGo("skills", "content")}>
              去看内容
            </Button>
            <Button type="button" variant="outline" onClick={() => onGo("settings")}>
              打开设置
            </Button>
          </>
        )}
      </div>
      <section className="mt-8">
        <h2 className="text-base font-medium text-ink-strong">需要处理</h2>
        {issues.length === 0 ? (
          <p className="mt-2 text-sm text-ink-mid">没有需要立刻处理的事。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {issues.map((item) => (
              <li key={item.text}>
                <button
                  type="button"
                  onClick={() => onGo(item.go.page, item.go.tab)}
                  className="text-left text-sm text-ink-mid underline-offset-4 hover:text-ink-strong hover:underline"
                >
                  {item.text}
                </button>
              </li>
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
