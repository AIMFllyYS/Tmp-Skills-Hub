import type { AppPage } from "./page.js";

const NAV: { id: Exclude<AppPage, "settings">; label: string; testId: string }[] = [
  { id: "overview", label: "总览", testId: "nav-overview" },
  { id: "stats", label: "统计", testId: "nav-stats" },
  { id: "skills", label: "Skills 管理", testId: "nav-skills" },
];

interface SidebarProps {
  page: AppPage;
  onPage: (page: AppPage) => void;
}

function NavButton({
  label,
  active,
  testId,
  onClick,
}: {
  label: string;
  active: boolean;
  testId: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={
        "w-full px-4 py-2 text-left text-sm transition-colors duration-150 " +
        (active ? "bg-surface text-ink-strong" : "text-ink-mid hover:bg-surface hover:text-ink-strong")
      }
    >
      {label}
    </button>
  );
}

/** 左侧三板块 + 左下角设置。 */
export function Sidebar({ page, onPage }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line">
      <div className="border-b border-line px-4 py-4">
        <p className="text-sm font-medium text-ink-strong">skill-hub</p>
        <p className="mt-1 text-xs text-ink-faint">本机技能管理</p>
      </div>
      <nav className="flex-1 py-2" aria-label="板块">
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            testId={item.testId}
            active={page === item.id}
            onClick={() => onPage(item.id)}
          />
        ))}
      </nav>
      <div className="border-t border-line py-2">
        <NavButton
          label="设置"
          testId="nav-settings"
          active={page === "settings"}
          onClick={() => onPage("settings")}
        />
      </div>
    </aside>
  );
}
