import { BarChart3, Blocks, LayoutDashboard, PanelLeft, PanelLeftClose, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AppPage } from "./page.js";

const NAV: { id: AppPage; label: string; testId: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", testId: "nav-overview", icon: LayoutDashboard },
  { id: "stats", label: "统计", testId: "nav-stats", icon: BarChart3 },
  { id: "skills", label: "Skills 管理", testId: "nav-skills", icon: Blocks },
];

interface SidebarProps {
  page: AppPage;
  collapsed: boolean;
  settingsOpen: boolean;
  onPage: (page: AppPage) => void;
  onSettings: () => void;
  onToggleCollapsed: () => void;
}

function NavButton({
  label,
  active,
  testId,
  collapsed,
  icon: Icon,
  onClick,
}: {
  label: string;
  active: boolean;
  testId: string;
  collapsed: boolean;
  icon: typeof LayoutDashboard;
  onClick: () => void;
}): React.JSX.Element {
  const btn = (
    <Button
      type="button"
      data-testid={testId}
      variant="ghost"
      size={collapsed ? "icon" : "default"}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      onClick={onClick}
      className={cn(
        collapsed ? "mx-auto" : "w-full justify-start rounded-none px-4",
        active && "bg-surface text-ink-strong",
      )}
    >
      <Icon className="size-4 shrink-0 text-ink-mid" aria-hidden />
      {!collapsed && label}
    </Button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip label={label} side="right">
      {btn}
    </Tooltip>
  );
}

/** 左侧三板块 + 左下角设置。可收成图标栏。 */
export function Sidebar({
  page,
  collapsed,
  settingsOpen,
  onPage,
  onSettings,
  onToggleCollapsed,
}: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line">
      <div className={cn("flex items-center gap-2 px-3 py-3", collapsed && "justify-center px-1")}>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-strong">skill-hub</p>
            <p className="mt-1 truncate text-xs text-ink-faint">本机技能管理</p>
          </div>
        )}
        <Tooltip label={collapsed ? "展开侧栏" : "收起侧栏"} side="right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            onClick={onToggleCollapsed}
          >
            {collapsed
              ? <PanelLeft className="size-4 text-ink-mid" aria-hidden />
              : <PanelLeftClose className="size-4 text-ink-mid" aria-hidden />}
          </Button>
        </Tooltip>
      </div>
      <Separator />
      <nav className="flex-1 py-2" aria-label="板块">
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            testId={item.testId}
            collapsed={collapsed}
            icon={item.icon}
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
          collapsed={collapsed}
          icon={Settings}
          active={settingsOpen}
          onClick={onSettings}
        />
      </div>
    </aside>
  );
}
