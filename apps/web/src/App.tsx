import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { ConflictAgentHandoff } from "./features/conflicts/types.js";
import { useConflictCatalog } from "./features/conflicts/use-conflict-catalog.js";
import { ReconcileBanner } from "./features/reconcile/ReconcileBanner.js";
import { useReconcile } from "./features/reconcile/use-reconcile.js";
import { Sidebar } from "./features/shell/Sidebar.js";
import { useStoreMaintenance } from "./features/shell/use-store-maintenance.js";
import type { AppPage, ShellNav, SkillsTab } from "./features/shell/page.js";
import {
  readShellPrefs,
  SIDEBAR_ICON_PX,
  SIDEBAR_MAX_PX,
  SIDEBAR_MIN_PX,
  writeShellPrefs,
  type ShellPrefs,
} from "./features/shell/shell-prefs.js";
import { useCatalog } from "./features/skills/use-catalog.js";

const AgentPage = lazy(() => import("./features/agent/AgentPage.js").then((m) => ({ default: m.AgentPage })));
const PlaybookPage = lazy(() =>
  import("./features/playbook/PlaybookPage.js").then((m) => ({ default: m.PlaybookPage })),
);
const SettingsDialog = lazy(() =>
  import("./features/shell/SettingsDialog.js").then((m) => ({ default: m.SettingsDialog })),
);
const OverviewPage = lazy(() => import("./features/shell/OverviewPage.js").then((m) => ({ default: m.OverviewPage })));
const StoreOnboarding = lazy(() => import("./features/shell/StoreOnboarding.js").then((m) => ({ default: m.StoreOnboarding })));
const SkillsPage = lazy(() => import("./features/shell/SkillsPage.js").then((m) => ({ default: m.SkillsPage })));
const StatsPage = lazy(() => import("./features/shell/StatsPage.js").then((m) => ({ default: m.StatsPage })));
const ReconcileDialog = lazy(() =>
  import("./features/reconcile/ReconcileDialog.js").then((m) => ({ default: m.ReconcileDialog })),
);

const PAGE_LABELS: Record<Exclude<AppPage, "agent">, string> = {
  overview: "总览",
  stats: "统计",
  skills: "Skills 管理",
};

function isPlaybookRoute(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return p === "/playbook" || p.startsWith("/playbook/");
}

export default function App() {
  if (isPlaybookRoute()) {
    return (
      <ErrorBoundary onRetry={() => window.location.reload()}>
        <div className="h-dvh overflow-hidden bg-white">
          <Toaster />
          <Suspense fallback={<PageSkeleton />}>
            <PlaybookPage />
          </Suspense>
        </div>
      </ErrorBoundary>
    );
  }
  return <MainShellApp />;
}

function MainShellApp() {
  const [prefs] = useState<ShellPrefs>(readShellPrefs);
  const [page, setPage] = useState<AppPage>("overview");
  const [skillsTab, setSkillsTab] = useState<SkillsTab>("apps");
  const [agentHandoff, setAgentHandoff] = useState<ConflictAgentHandoff | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [desktopReconcileRequest, setDesktopReconcileRequest] = useState(
    () => window.skillsHubDesktop?.isDesktop === true && window.location.hash === "#reconcile" ? 1 : 0,
  );
  const consumedReconcileRequest = useRef(0);
  const [collapsed, setCollapsed] = useState(prefs.collapsed);
  const [sidebarWidth, setSidebarWidth] = useState(prefs.width);
  const [sidebarMotion, setSidebarMotion] = useState(false);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const sidebarPanelRef = usePanelRef();
  const widthRaf = useRef<number | null>(null);
  const motionTimer = useRef<number | null>(null);
  const sidebarMotionRef = useRef(false);
  const catalog = useCatalog({ loadClientStates: page === "skills" && skillsTab === "apps" });
  const maintenance = useStoreMaintenance(catalog.status === "ready" && (page === "overview" || settingsOpen), catalog.storeRoot, catalog.reload);
  const conflictCatalog = useConflictCatalog(catalog.status === "ready" ? catalog.storeRoot : null);
  const refreshConflictState = async () => {
    catalog.refresh();
    await conflictCatalog.refresh();
  };
  const reconcile = useReconcile(catalog.status === "ready" ? catalog.storeRoot : null, () => {
    catalog.reload();
    void conflictCatalog.refresh();
  }, () => {
    setSkillsTab("conflicts");
    setPage("skills");
  });
  const rescan = catalog.status === "ready" ? { scanning: reconcile.scanning, onRescan: reconcile.rescan } : undefined;
  const openReconcile = reconcile.showPreview;

  useEffect(() => window.skillsHubDesktop?.onReconcileRequested?.(
    () => setDesktopReconcileRequest((request) => request + 1),
  ), []);

  useEffect(() => {
    if (desktopReconcileRequest === consumedReconcileRequest.current || catalog.status !== "ready") return;
    consumedReconcileRequest.current = desktopReconcileRequest;
    if (window.location.hash === "#reconcile") {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    if (!reconcile.dialog.open) openReconcile();
  }, [catalog.status, desktopReconcileRequest, openReconcile, reconcile.dialog.open]);

  useEffect(() => {
    writeShellPrefs({ collapsed, width: sidebarWidth });
  }, [collapsed, sidebarWidth]);

  useEffect(() => {
    return () => {
      if (widthRaf.current !== null) cancelAnimationFrame(widthRaf.current);
      if (motionTimer.current !== null) window.clearTimeout(motionTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!sidebarDragging) return;
    const stop = (): void => setSidebarDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [sidebarDragging]);

  const appliedCollapse = useRef(false);
  useEffect(() => {
    if (appliedCollapse.current) return;
    appliedCollapse.current = true;
    if (prefs.collapsed) sidebarPanelRef.current?.collapse();
  }, [prefs.collapsed, sidebarPanelRef]);

  const go = (target: ShellNav): void => {
    if (target.settings === true) {
      setSettingsOpen(true);
      return;
    }
    if (target.page !== undefined) {
      setAgentHandoff(target.agentHandoff ?? null);
      setPage(target.page);
    }
    if (target.tab !== undefined) setSkillsTab(target.tab);
    if (target.clientId !== undefined) catalog.setSelectedClientId(target.clientId);
    if (target.hash !== undefined) catalog.setFocusedHash(target.hash);
  };

  const armSidebarMotion = useCallback((): void => {
    sidebarMotionRef.current = true;
    flushSync(() => setSidebarMotion(true));
    if (motionTimer.current !== null) window.clearTimeout(motionTimer.current);
    motionTimer.current = window.setTimeout(() => {
      motionTimer.current = null;
      sidebarMotionRef.current = false;
      setSidebarMotion(false);
    }, 320);
  }, []);

  const toggleCollapsed = (): void => {
    const next = !collapsed;
    armSidebarMotion();
    setCollapsed(next);
    if (next) {
      sidebarPanelRef.current?.resize(SIDEBAR_ICON_PX);
      sidebarPanelRef.current?.collapse();
      return;
    }
    const width = Math.max(sidebarWidth, SIDEBAR_MIN_PX);
    sidebarPanelRef.current?.expand();
    sidebarPanelRef.current?.resize(width);
  };

  return (
    <ErrorBoundary onRetry={catalog.reload}>
      <div className="h-dvh overflow-hidden bg-white">
        <Toaster />
        <ResizablePanelGroup
          orientation="horizontal"
          className={cn("h-full w-full", sidebarMotion && "sidebar-motion", sidebarDragging && "sidebar-dragging")}
        >
          <ResizablePanel
            id="shell-nav"
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize={SIDEBAR_ICON_PX}
            defaultSize={prefs.collapsed ? SIDEBAR_ICON_PX : prefs.width}
            minSize={collapsed || sidebarMotion ? SIDEBAR_ICON_PX : SIDEBAR_MIN_PX}
            maxSize={SIDEBAR_MAX_PX}
            groupResizeBehavior="preserve-pixel-size"
            className="overflow-hidden"
            style={{ overflow: "hidden" }}
            onResize={(size) => {
              if (sidebarMotionRef.current) return;
              const px = Math.round(size.inPixels);
              const nowCollapsed = px <= SIDEBAR_ICON_PX + 8;
              setCollapsed(nowCollapsed);
              if (nowCollapsed) return;
              if (widthRaf.current !== null) cancelAnimationFrame(widthRaf.current);
              widthRaf.current = requestAnimationFrame(() => {
                widthRaf.current = null;
                setSidebarWidth(px);
              });
            }}
          >
            <Sidebar
              page={page}
              collapsed={collapsed}
              settingsOpen={settingsOpen}
              onPage={(next) => go({ page: next })}
              onSettings={() => setSettingsOpen(true)}
              onToggleCollapsed={toggleCollapsed}
              rescan={rescan}
              conflictCount={conflictCatalog.records.length}
            />
          </ResizablePanel>
          <ResizableHandle
            disabled={collapsed}
            className="w-1 bg-line motion-fill hover:bg-line-strong"
            onPointerDown={() => {
              setSidebarDragging(true);
              sidebarMotionRef.current = false;
              setSidebarMotion(false);
              if (motionTimer.current !== null) {
                window.clearTimeout(motionTimer.current);
                motionTimer.current = null;
              }
            }}
            onPointerUp={() => setSidebarDragging(false)}
          />
          <ResizablePanel id="shell-main" minSize="40%" className="min-w-0">
            <main className="flex h-full min-h-0 min-w-0 flex-col">
              {catalog.status === "offline" && (
                <div className="flex shrink-0 items-center justify-between gap-3 bg-amber-50 px-6 py-3 text-sm text-amber-800">
                  <p>未连接到本地数据服务。先运行一键启动,再刷新本页。</p>
                  <Button type="button" size="sm" variant="outline" onClick={catalog.reload}>
                    重试连接
                  </Button>
                </div>
              )}
              {catalog.status === "loading" && <PageSkeleton />}
              {catalog.status === "ready" && (
                <ReconcileBanner
                  summary={reconcile.summary}
                  dismissed={reconcile.dismissed}
                  onDismiss={reconcile.dismiss}
                  onOpenDialog={reconcile.showPreview}
                  className="shrink-0"
                />
              )}
              {catalog.status === "unconfigured" && (
                <ErrorBoundary key={page}>
                  <Suspense fallback={<PageSkeleton />}>
                    <div key={page} className="motion-enter flex min-h-0 flex-1 flex-col">
                      {page === "agent" ? (
                        <AgentPage onMutated={catalog.refresh} />
                      ) : (
                        <StoreOnboarding
                          title={PAGE_LABELS[page]}
                          clientCount={catalog.clients.length}
                          onInit={catalog.initializeStore}
                          onOpenAgent={() => setPage("agent")}
                        />
                      )}
                    </div>
                  </Suspense>
                </ErrorBoundary>
              )}
              {catalog.status === "ready" && (
                <ErrorBoundary key={page}>
                  <Suspense fallback={<PageSkeleton />}>
                    <div key={page} className="motion-enter flex min-h-0 flex-1 flex-col">
                      {page === "overview" && (
                        <OverviewPage
                          skills={catalog.skills}
                          clients={catalog.clients}
                          doctor={catalog.doctor}
                          maintenance={maintenance}
                          snapshotCount={catalog.snapshotCount}
                          doctorLoading={catalog.doctorLoading}
                          backupsLoading={catalog.backupsLoading}
                          onGo={go}
                          rescan={rescan}
                          conflictCount={conflictCatalog.records.length}
                        />
                      )}
                      {page === "stats" && (
                        <StatsPage
                          skills={catalog.skills}
                          clients={catalog.clients}
                          ranking={catalog.ranking}
                          counters={catalog.usageByHash}
                          statsLoading={catalog.statsLoading}
                          onGo={go}
                        />
                      )}
                      {page === "skills" && (
                        <SkillsPage
                          tab={skillsTab}
                          onTab={setSkillsTab}
                          skills={catalog.skills}
                          clients={catalog.clients}
                          groups={catalog.groups}
                          archived={catalog.archived}
                          archiveLoading={catalog.archiveLoading}
                          focusedHash={catalog.focusedHash}
                          onFocus={catalog.setFocusedHash}
                          pendingHash={catalog.pendingHash}
                          clientStates={catalog.clientStates}
                          selectedClientId={catalog.selectedClientId}
                          onSelectClient={catalog.setSelectedClientId}
                          onToggle={catalog.toggle}
                          onSaved={catalog.markSaved}
                          onRefresh={catalog.refresh}
                          onRestore={catalog.restore}
                          onArchive={catalog.archive}
                          onNotice={(text) => toast(text)}
                          conflictCatalog={conflictCatalog}
                          onConflictResolved={refreshConflictState}
                          onAgentHandoff={(handoff) => go({ page: "agent", agentHandoff: handoff })}
                        />
                      )}
                      {page === "agent" && (
                        <AgentPage onMutated={() => void refreshConflictState()} initialPrompt={agentHandoff?.prompt} />
                      )}
                    </div>
                  </Suspense>
                </ErrorBoundary>
              )}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
        {reconcile.dialog.open && (
          <Suspense fallback={null}>
            <ReconcileDialog {...reconcile.dialog} />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            storeRoot={catalog.storeRoot}
            clients={catalog.clients}
            latestSnapshotId={catalog.latestSnapshotId}
            backupsLoading={catalog.backupsLoading}
            maintenance={maintenance}
            onResetDone={maintenance.reload}
          />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
