import { BarChart3, Blocks, LayoutDashboard, PanelLeft, PanelLeftClose, Settings, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { Logo } from "@/components/ui/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AppPage } from "./page.js";
import { SIDEBAR_ICON_PX } from "./shell-prefs.js";

const NAV: { id: AppPage; label: string; testId: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", testId: "nav-overview", icon: LayoutDashboard },
  { id: "stats", label: "统计", testId: "nav-stats", icon: BarChart3 },
  { id: "skills", label: "Skills 管理", testId: "nav-skills", icon: Blocks },
  { id: "agent", label: "Agent", testId: "nav-agent", icon: Sparkles },
];

/** 行左右各留 6px 做胶囊;图标列 = 48 − 12 = 36px,图标中心仍落在 24px,收起时与 48px 窄栏对齐。 */
const ROW_INSET_PX = 6;
const RAIL_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${SIDEBAR_ICON_PX - ROW_INSET_PX * 2}px minmax(0, 1fr)`,
};

interface SidebarProps {
  page: AppPage;
  collapsed: boolean;
  settingsOpen: boolean;
  /** 库存数(加载中为 null),显示在「Skills 管理」右侧。 */
  skillCount?: number | null;
  /** 本地数据服务是否连通。 */
  online?: boolean;
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
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  testId: string;
  collapsed: boolean;
  icon: typeof LayoutDashboard;
  count?: number | null | undefined;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <Tooltip label={label} side="right" disabled={!collapsed}>
      <button
        type="button"
        data-testid={testId}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        onClick={onClick}
        style={{ ...RAIL_GRID, marginInline: ROW_INSET_PX }}
        className={cn(
          "group relative h-9 min-w-0 items-center rounded-lg text-sm outline-none motion-press",
          "focus-visible:ring-2 focus-visible:ring-volt-fill/60",
          active
            ? "bg-card font-medium text-ink-strong shadow-card ring-1 ring-line"
            : "text-ink-mid hover:bg-ink-strong/[0.04] hover:text-ink-strong",
        )}
      >
        {active && (
          <span
            className="absolute top-2 bottom-2 -left-1.5 w-[3px] rounded-r-full bg-volt-fill ring-1 ring-volt/30"
            aria-hidden
          />
        )}
        <span className="flex items-center justify-center">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-md motion-fill",
              active ? "bg-volt-soft text-volt" : "text-ink-faint group-hover:text-ink-mid",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        </span>
        <span className="sidebar-copy flex min-w-0 items-center justify-between gap-2 pr-2.5 text-left">
          <span className="truncate">{label}</span>
          {count !== undefined && count !== null && (
            <span className="font-mono text-[11px] text-ink-faint tabular-nums">{count}</span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}

/** 左侧栏:画布色底,当前板块是白色胶囊 + 信号色指示条(ui-design-v2 §2.2)。 */
export function Sidebar({
  page,
  collapsed,
  settingsOpen,
  skillCount = null,
  online = true,
  onPage,
  onSettings,
  onToggleCollapsed,
}: SidebarProps): React.JSX.Element {
  return (
    <aside
      data-testid="shell-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      <div
        className="h-14 w-full shrink-0 items-center"
        style={{ display: "grid", gridTemplateColumns: `${SIDEBAR_ICON_PX}px minmax(0, 1fr)` }}
      >
        <Tooltip label={collapsed ? "展开侧栏" : "收起侧栏"} side="right">
          <button
            type="button"
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            data-testid="nav-collapse"
            onClick={onToggleCollapsed}
            className="group mx-auto flex size-9 items-center justify-center rounded-lg outline-none motion-press hover:bg-ink-strong/[0.05] focus-visible:ring-2 focus-visible:ring-volt-fill/60"
          >
            {collapsed ? (
              <>
                <Logo className="size-6 group-hover:hidden" />
                <PanelLeft className="hidden size-4 text-ink-mid group-hover:block" aria-hidden />
              </>
            ) : (
              <PanelLeftClose className="size-4 text-ink-faint group-hover:text-ink-mid" aria-hidden />
            )}
          </button>
        </Tooltip>
        <div className="sidebar-copy flex min-w-0 items-center gap-2.5 pr-3">
          <Logo className="size-6" />
          <div className="min-w-0">
            <p data-testid="sidebar-brand" className="truncate text-sm font-semibold tracking-tight text-ink-strong">
              Skills Hub
            </p>
            <p data-testid="sidebar-tagline" className="truncate text-[11px] text-ink-faint">
              团队的 Skill 中枢
            </p>
          </div>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pt-3" aria-label="板块">
        <p className="sidebar-copy mb-1 px-4 text-[11px] font-medium text-ink-faint">工作区</p>
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            testId={item.testId}
            collapsed={collapsed}
            icon={item.icon}
            active={page === item.id}
            count={item.id === "skills" ? skillCount : undefined}
            onClick={() => onPage(item.id)}
          />
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-1 pb-3">
        <NavButton
          label="设置"
          testId="nav-settings"
          collapsed={collapsed}
          icon={Settings}
          active={settingsOpen}
          onClick={onSettings}
        />
        <div
          className="h-8 w-full items-center"
          style={{ display: "grid", gridTemplateColumns: `${SIDEBAR_ICON_PX}px minmax(0, 1fr)` }}
          title={online ? "本地数据服务已连接" : "未连接本地数据服务"}
        >
          <span className="flex items-center justify-center" aria-hidden>
            <span className={cn("size-1.5 rounded-full", online ? "bg-volt-fill ring-2 ring-volt-soft" : "bg-amber-500")} />
          </span>
          <span className="sidebar-copy truncate pr-3 font-mono text-[11px] text-ink-faint">
            {online ? "127.0.0.1 · 已连接" : "离线"}
          </span>
        </div>
      </div>
    </aside>
  );
}
