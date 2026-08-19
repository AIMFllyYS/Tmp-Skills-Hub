import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
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
    <Button
      type="button"
      data-testid={testId}
      variant="ghost"
      onClick={onClick}
      className={cn("w-full justify-start rounded-none px-4", active && "bg-surface text-ink-strong")}
    >
      {label}
    </Button>
  );
}

/** 左侧三板块 + 左下角设置。 */
export function Sidebar({ page, onPage }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line">
      <div className="px-4 py-4">
        <p className="text-sm font-medium text-ink-strong">skill-hub</p>
        <p className="mt-1 text-xs text-ink-faint">本机技能管理</p>
      </div>
      <Separator />
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
      <Separator />
      <div className="py-2">
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
