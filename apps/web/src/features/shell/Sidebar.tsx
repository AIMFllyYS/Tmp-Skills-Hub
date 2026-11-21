import { BarChart3, Blocks, MessagesSquare, FolderOpen, SquarePen, ChevronRight, LayoutDashboard, PanelLeft, PanelLeftClose, Settings } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RescanTriggerButton, type RescanTriggerButtonProps } from "../reconcile/ReconcileBanner.js";
import type { AppPage } from "./page.js";
import type { Thread } from "../agent/threads.js";
import { SIDEBAR_ICON_PX } from "./shell-prefs.js";

const NAV: { id: AppPage; label: string; testId: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", testId: "nav-overview", icon: LayoutDashboard },
  { id: "stats", label: "统计", testId: "nav-stats", icon: BarChart3 },
  { id: "skills", label: "Skills 管理", testId: "nav-skills", icon: Blocks },
  { id: "agent", label: "Agent", testId: "nav-agent", icon: MessagesSquare },
];

/** 图标列固定 48px；文案在第二列。收起只裁切第二列，图标中心始终在 24px。 */
const RAIL_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${SIDEBAR_ICON_PX}px minmax(0, 1fr)`,
};

interface SidebarProps {
  chats: { current: string; threads: Thread[] };
  onChat: (id?: string) => void;
  page: AppPage;
  collapsed: boolean;
  settingsOpen: boolean;
  onPage: (page: AppPage) => void;
  onSettings: () => void;
  onToggleCollapsed: () => void;
  rescan?: RescanTriggerButtonProps | undefined;
  conflictCount?: number;
}

function NavButton({
  label,
  active,
  testId,
  collapsed,
  icon: Icon,
  onClick,
  count = 0,
}: {
  label: string;
  active: boolean;
  testId: string;
  collapsed: boolean;
  icon: typeof LayoutDashboard;
  onClick: () => void;
  count?: number;
}): React.JSX.Element {
  return (
    <Tooltip label={label} side="right" disabled={!collapsed}>
      <Button
        type="button"
        data-testid={testId}
        variant="ghost"
        aria-current={active ? "page" : undefined}
        aria-label={count > 0 ? label + "，" + String(count) + " 个冲突待处理" : label}
        onClick={onClick}
        style={RAIL_GRID}
        className={cn(
          "h-9 w-full min-w-0 justify-stretch gap-0 rounded-none p-0",
          active && "bg-surface text-ink-strong",
        )}
      >
        <span className="flex items-center justify-center">
          <Icon className="size-4 text-ink-mid" aria-hidden />
        </span>
        <span className="sidebar-copy flex items-center gap-2 pr-3 text-left text-sm">
          {label}
          {count > 0 && <Badge tone="warning" data-testid="sidebar-conflict-count">{count}</Badge>}
        </span>
      </Button>
    </Tooltip>
  );
}

/** 左侧栏：CSS grid 图标列 + 文案列。展开/收起同一套格子，不换尺寸、不加垫层。 */
export function Sidebar({
  page,
  collapsed,
  settingsOpen,
  onPage,
  onSettings,
  onToggleCollapsed,
  rescan,
  conflictCount = 0, chats, onChat,
}: SidebarProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  return (
    <aside
      data-testid="shell-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      <div className="h-12 w-full shrink-0 items-stretch" style={RAIL_GRID}>
        <Tooltip label={collapsed ? "展开侧栏" : "收起侧栏"} side="right">
          <Button
            type="button"
            variant="ghost"
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            data-testid="nav-collapse"
            onClick={onToggleCollapsed}
            className="h-full w-full justify-center gap-0 rounded-none p-0"
          >
            {collapsed
              ? <PanelLeft className="size-4 text-ink-mid" aria-hidden />
              : <PanelLeftClose className="size-4 text-ink-mid" aria-hidden />}
          </Button>
        </Tooltip>
        <div className="sidebar-copy flex min-w-0 flex-col justify-center pr-3">
          <p data-testid="sidebar-brand" className="text-sm font-medium text-ink-strong">skill-hub</p>
          <p data-testid="sidebar-tagline" className="mt-0.5 text-xs text-ink-faint">本机技能管理</p>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col py-1" aria-label="板块">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              label={item.label}
              testId={item.testId}
              collapsed={collapsed}
              icon={item.icon}
              active={page === item.id}
              count={item.id === "skills" ? conflictCount : 0}
              onClick={() => onPage(item.id)}
            />
          ))}
          {page === "agent" && !collapsed && <div className="mx-2 mt-2 min-w-0">
            <div className="flex items-center rounded-lg bg-surface">
              <Button variant="ghost" className="min-w-0 flex-1 justify-start gap-1 px-2" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
                <ChevronRight className={cn("size-3", expanded && "rotate-90")} /><FolderOpen className="size-4" />我的对话
              </Button>
              <Button variant="ghost" size="sm" title="新建对话" aria-label="新建对话" onClick={() => { setExpanded(true); onChat(); }}><SquarePen size={15}/></Button>
            </div>
            {expanded && <ul className="ml-4 mt-1 space-y-0.5 border-l border-line pl-2">{chats.threads.map(t => <li key={t.id}>
              <Button variant="ghost" size="sm" title={t.title} aria-current={chats.current === t.id ? "page" : undefined} className={cn("w-full justify-start px-2", chats.current === t.id && "bg-surface font-medium")} onClick={() => onChat(t.id)}><span className="truncate">{t.title}</span></Button>
            </li>)}</ul>}
          </div>}
          {page === "agent" && collapsed && <Button variant="ghost" title="新建对话" aria-label="新建对话" onClick={() => onChat()}><SquarePen size={16} /></Button>}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="shrink-0 py-1">
        {rescan !== undefined && (
          <div className="flex px-1.5 pb-1">
            <RescanTriggerButton {...rescan} iconOnly={collapsed} className="h-9 w-full" />
          </div>
        )}
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
