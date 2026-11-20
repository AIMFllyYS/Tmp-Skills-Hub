import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getAction } from "../actions/registry.js";
import { formatResetPreview } from "../skills/catalog.js";
import type { ClientInfo } from "../skills/types.js";
import { groupClientIds } from "./apps-layout.js";
import { DesktopAutoLaunchSection, DualPathSettingsSection, MigrateStoreDialog, SelfHealSection } from "./SettingsV3Panels.js";
import { fetchStoreSettings, migrateStore, patchStoreSettings, type StoreSettings } from "./store-operations-api.js";
import type { StoreMaintenance } from "./use-store-maintenance.js";

const RESET_FALLBACK_BODY =
  "将按最近一份备份还原各应用里的 skills,并旁路旧库存后再收录。此操作不能用撤销按钮收回。";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeRoot: string;
  clients: ClientInfo[];
  maintenance: StoreMaintenance;
  latestSnapshotId: string | null;
  backupsLoading?: boolean;
  onResetDone: () => void;
}

/** 左下角设置覆盖层：只读路径、折叠应用名单、重置确认。 */
export function SettingsDialog({
  open,
  onOpenChange,
  storeRoot,
  clients,
  maintenance,
  latestSnapshotId,
  backupsLoading = false,
  onResetDone,
}: SettingsDialogProps): React.JSX.Element {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [desktopRefresh, setDesktopRefresh] = useState(0);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [previewBody, setPreviewBody] = useState(RESET_FALLBACK_BODY);
  const groups = groupClientIds(clients.map((c) => c.clientId));
  const reset = getAction("reset");

  useEffect(() => {
    if (!open) return;
    return window.skillsHubDesktop?.onPreferencesChanged?.(() => setDesktopRefresh((count) => count + 1));
  }, [open]);

  useEffect(() => {
    if (!open || storeRoot === "") return;
    const request = new AbortController();
    void fetchStoreSettings(request.signal).then(
      (value) => {
        if (request.signal.aborted) return;
        setSettings(value);
        setSettingsError(null);
      },
      (error: unknown) => {
        if (request.signal.aborted) return;
        setSettings(null);
        setSettingsError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => request.abort();
  }, [open, storeRoot, desktopRefresh]);

  const currentSettings = settings?.stateRoot === storeRoot ? settings : null;
  const migrate = async (target: string): Promise<void> => {
    const result = await migrateStore(target);
    setSettings((current) => current === null ? current : { ...current, ...result.paths });
    toast.success("已迁移 " + String(result.skills) + " 个技能至 " + result.paths.skillsRoot, {
      description: result.aside === null ? undefined : "原目录保留于 " + result.aside,
    });
    maintenance.reload();
    void fetchStoreSettings().then(setSettings, () => undefined);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy || migrateOpen) return;
          if (!next) setAsk(false);
          onOpenChange(next);
        }}
        disablePointerDismissal={ask || migrateOpen}
      >
        <DialogContent className="flex max-h-[min(36rem,90vh)] max-w-lg flex-col">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>不常改、但要找得到的东西。</DialogDescription>
          <ScrollArea className="mt-4 min-h-0 flex-1">
            {currentSettings !== null ? (
              <>
                <DualPathSettingsSection
                  stateRoot={currentSettings.stateRoot}
                  skillsRoot={currentSettings.skillsRoot}
                  stateDiskBytes={currentSettings.stateDiskBytes}
                  layoutMode={currentSettings.layoutMode}
                  onOpenMigrate={() => setMigrateOpen(true)}
                  migrateDisabled={busy}
                />
                <DesktopAutoLaunchSection
                  className="mt-6"
                  isDesktop={currentSettings.isDesktop}
                  autoLaunch={currentSettings.autoLaunch}
                  silentTray={currentSettings.silentTray}
                  onAutoLaunchChange={async (autoLaunch) => setSettings(await patchStoreSettings({ autoLaunch }))}
                  onSilentTrayChange={async (silentTray) => setSettings(await patchStoreSettings({ silentTray }))}
                />
              </>
            ) : storeRoot === "" ? (
              <p className="text-sm text-ink-mid">库存尚未初始化。</p>
            ) : settingsError !== null ? (
              <p role="alert" className="text-sm text-ink-mid">{settingsError}</p>
            ) : <Skeleton className="h-28 w-full" />}
            {maintenance.health !== null && storeRoot !== "" && (
              <SelfHealSection className="mt-6" {...maintenance.health} onPruneDangling={maintenance.onPruneDangling} onAcceptDrifted={maintenance.onAcceptDrifted} />
            )}
            {maintenance.error !== null && storeRoot !== "" && (
              <p role="alert" className="mt-4 text-sm text-ink-mid">健康检查失败。{maintenance.error}</p>
            )}

            <section className="mt-6">
              <Label>已发现的应用</Label>
              {clients.length === 0 ? (
                <p className="mt-2 text-sm text-ink-mid">未发现应用。</p>
              ) : (
                <Collapsible defaultOpen={false} className="mt-2">
                  <CollapsibleTrigger>
                    <span>已发现 {String(clients.length)} 个应用</span>
                    <span className="text-xs text-ink-faint">展开</span>
                  </CollapsibleTrigger>
                  <CollapsiblePanel className="mt-2 space-y-3 px-1 pb-1">
                    {groups.map((g) => (
                      <div key={g.key}>
                        <p className="mb-1 text-xs text-ink-faint">{g.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {g.ids.map((id) => (
                            <Badge key={id} title={id}>
                              {id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CollapsiblePanel>
                </Collapsible>
              )}
            </section>

            <section className="mt-6" data-testid="reset-panel">
              <Label>重置</Label>
              <p className="mt-1 text-sm text-ink-mid">
                按备份快照回到初始化前,再自动收录。请再次确认后才会执行。
              </p>
              {backupsLoading ? (
                <Skeleton className="mt-3 h-9 w-24" />
              ) : (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    data-testid="reset-button"
                    className="mt-3"
                    disabled={busy || latestSnapshotId === null}
                    onClick={() => {
                      if (latestSnapshotId === null) return;
                      setBusy(true);
                      void reset.preview({ snapshotId: latestSnapshotId })
                        .then((p) => setPreviewBody(formatResetPreview(p)))
                        .catch(() => setPreviewBody(RESET_FALLBACK_BODY))
                        .finally(() => {
                          setBusy(false);
                          setAsk(true);
                        });
                    }}
                  >
                    重置
                  </Button>
                  {latestSnapshotId === null && (
                    <p className="mt-2 text-sm text-ink-mid">尚无备份快照,无法重置。</p>
                  )}
                </>
              )}
            </section>
          </ScrollArea>
        </DialogContent>
        {migrateOpen && currentSettings !== null && (
          <MigrateStoreDialog
            open
            onOpenChange={setMigrateOpen}
            currentSkillsRoot={currentSettings.skillsRoot}
            onPreviewMigration={(target) => migrateStore(target, true)}
            onMigrate={migrate}
          />
        )}
      </Dialog>
      {ask && (
        <ConfirmDialog
          title="请再次确认"
          body={previewBody}
          confirmLabel="确认重置"
          busy={busy}
          onCancel={() => setAsk(false)}
          onConfirm={() => {
            if (latestSnapshotId === null) return;
            setBusy(true);
            void reset.execute({ snapshotId: latestSnapshotId, confirm: "reset" })
              .then((r) => {
                toast("已重置。重新收录 " + String(r.adopted) + " 份。");
                setAsk(false);
                onResetDone();
              })
              .catch((e: unknown) => {
                toast.error(e instanceof Error ? e.message : String(e));
                setAsk(false);
              })
              .finally(() => setBusy(false));
          }}
        />
      )}
    </>
  );
}
