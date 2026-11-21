import {
  BellRing,
  CheckCircle2,
  ChevronRight,
  FileWarning,
  Link2Off,
  Monitor,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ICON_STROKE, IconBadge, ShieldAuditGlyph } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PathField } from "@/components/ui/path-field";
import { Separator } from "@/components/ui/separator";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { StepList, type StepItem } from "@/components/ui/step-list";
import { Switch } from "@/components/ui/switch";
import { TruncateTip } from "@/components/ui/tooltip";
import { FolderPicker } from "./FolderPicker.js";
import { cn } from "@/lib/utils";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const DRIFTED_VISIBLE_LIMIT = 6;

/** 将字节数格式化为易读体积字符串（1024 进制，非正数或非法数值返回 "0 B"）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return String(Math.round(bytes)) + " B";
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const unit = BYTE_UNITS[unitIndex] ?? "TB";
  const digits = value >= 100 ? 0 : 1;
  return value.toFixed(digits) + " " + unit;
}

function normalizePathForCompare(raw: string): string {
  const trimmed = raw.trim().replace(/[\\/]+$/, "");
  const unified = trimmed.replaceAll("\\", "/");
  return /^[A-Za-z]:/.test(unified) ? unified.toLowerCase() : unified;
}

/** 校验迁移目标路径是否为合法绝对路径且不同于当前真源目录。 */
export function validateMigrateTargetPath(targetPath: string, currentPath: string): string | null {
  const trimmed = targetPath.trim();
  if (trimmed === "") return "请输入目标目录的绝对路径";

  const isWindowsDrive = /^[A-Za-z]:[\\/].+/.test(trimmed);
  const isWindowsUnc = /^\\\\[^\\]+\\[^\\]+/.test(trimmed);
  const isPosixAbsolute = /^\/.+/.test(trimmed);
  if (!isWindowsDrive && !isWindowsUnc && !isPosixAbsolute) {
    return "请输入有效的绝对路径（例如 D:\\skills-hub\\skills 或 /Users/name/skills-hub/skills）";
  }

  if (currentPath.trim() !== "" && normalizePathForCompare(trimmed) === normalizePathForCompare(currentPath)) {
    return "目标路径不能与当前技能文件夹相同";
  }
  return null;
}

export interface DualPathSettingsSectionProps {
  stateRoot: string;
  skillsRoot: string;
  stateDiskBytes?: number;
  layoutMode?: "legacy" | "split";
  migrateDisabled?: boolean;
  onOpenMigrate: () => void;
  onCopyError?: () => void;
  className?: string;
}

/** 设置页双路径展示块：只读控制备份区 + 可迁移唯一真源路径。 */
export function DualPathSettingsSection({
  stateRoot,
  skillsRoot,
  stateDiskBytes,
  layoutMode,
  migrateDisabled = false,
  onOpenMigrate,
  onCopyError,
  className,
}: DualPathSettingsSectionProps): React.JSX.Element {
  const handleCopyError = onCopyError ?? (() => toast.error("无法复制路径"));
  const stateHint = stateDiskBytes !== undefined ? "占用 " + formatBytes(stateDiskBytes) : undefined;

  return (
    <section className={cn("space-y-4", className)} data-testid="dual-path-settings-section">
      <PathField
        label="技能文件夹"
        path={skillsRoot}
        hint="各客户端共用这里的技能原文件"
        onCopyError={handleCopyError}
        testId="settings-skills-root"
        trailing={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={migrateDisabled}
            onClick={onOpenMigrate}
            data-testid="settings-migrate-button"
            className="h-7 shrink-0 bg-white px-2.5 text-xs"
          >
            更换位置
          </Button>
        }
      />
      <PathField
        label="设置与备份"
        path={stateRoot}
        tag="由应用管理"
        {...(stateHint !== undefined ? { hint: stateHint } : {})}
        onCopyError={handleCopyError}
        testId="settings-state-root"
      />
      {layoutMode === "legacy" && (
        <p className="text-xs text-ink-mid">
          当前兼容旧版单根目录结构；通过「更换位置」指定新文件夹后，将自动升级为状态与资产分离布局。
        </p>
      )}
    </section>
  );
}

export interface MigrateStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSkillsRoot: string;
  managedLinkCount?: number;
  onPreviewMigration?: (targetSkillsRoot: string) => Promise<{ movedLinks: number; skills: number }>;
  onMigrate: (targetSkillsRoot: string) => Promise<void>;
  nested?: boolean;
}

/** 技能文件夹安全迁移弹窗：路径校验 + 4 步原子迁移预演 + 零真删除保障。 */
export function MigrateStoreDialog({
  open,
  onOpenChange,
  currentSkillsRoot,
  managedLinkCount,
  onPreviewMigration,
  onMigrate,
  nested = true,
}: MigrateStoreDialogProps): React.JSX.Element {
  const [targetPath, setTargetPath] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ movedLinks: number; skills: number } | null>(null);

  const validationError = validateMigrateTargetPath(targetPath, currentSkillsRoot);
  const showError = touched && validationError !== null;
  const linkCount = plan?.movedLinks ?? managedLinkCount;

  const steps: StepItem[] = [
    {
      id: "copy-verify",
      title: "复制技能并核对内容",
      detail: "复制全部活跃 Skill 至目标目录，校验字节与内容指纹完全一致",
      status: busy ? "active" : "idle",
    },
    {
      id: "relink-journal",
      title: "更新客户端链接",
      detail: linkCount === undefined
        ? "将客户端软链接切换至新路径；任一步失败将逆序回滚"
        : "安全切换 " + String(linkCount) + " 条客户端软链接至新路径；任一步失败将逆序回滚",
      status: "idle",
    },
    {
      id: "update-config",
      title: "原子更新配置文件",
      detail: "写回 ~/.skills-hub/config.json 并刷新本地数据服务上下文",
      status: "idle",
    },
    {
      id: "aside-old",
      title: "保留原文件夹作为备份",
      detail: "保留一份迁移前的原文件。Windows 占用旧文件夹时，备份会留在原位置。",
      status: "idle",
    },
  ];

  const handleOpenChange = (next: boolean): void => {
    if (busy) return;
    if (!next) {
      setTargetPath("");
      setTouched(false);
      setPlan(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (): Promise<void> => {
    setTouched(true);
    if (validationError !== null) return;
    const trimmed = targetPath.trim();
    setBusy(true);
    try {
      if (onPreviewMigration !== undefined && plan === null) {
        setPlan(await onPreviewMigration(trimmed));
        return;
      }
      await onMigrate(trimmed);
      setTargetPath("");
      setTouched(false);
      setPlan(null);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} disablePointerDismissal={busy}>
      <DialogContent nested={nested} className="max-w-lg" data-testid="migrate-store-dialog">
        <DialogTitle>更换技能文件夹</DialogTitle>
        <DialogDescription>
          先检查新位置。确认后会复制技能文件、逐项校验内容，并更新客户端链接。
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div className="space-y-1">
            <span className="text-xs font-medium text-ink-faint">当前技能文件夹</span>
            <div className="rounded-xl border border-line bg-canvas px-3 py-2">
              <TruncateTip
                text={currentSkillsRoot === "" ? "未配置" : currentSkillsRoot}
                className="font-mono text-xs text-ink-mid"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="migrate-target-skills-root">新文件夹</Label>
            <div className="flex items-center gap-2">
              <Input
                id="migrate-target-skills-root"
                value={targetPath}
                onChange={(e) => {
                  setTargetPath(e.target.value);
                  setPlan(null);
                  if (!touched) setTouched(true);
                }}
                placeholder="例如 D:\skills-hub\skills 或 /Users/name/skills-hub/skills"
                disabled={busy}
                aria-invalid={showError}
                data-testid="migrate-target-path"
                className="font-mono text-xs"
              />
              <FolderPicker disabled={busy} onPick={(folder) => {
                setTargetPath(folder);
                setPlan(null);
                setTouched(true);
              }} />
            </div>
            {showError ? (
              <p className="text-xs text-red-700" role="alert">
                {validationError}
              </p>
            ) : (
              <p className="text-xs text-ink-faint">
                目标路径需为空目录或尚未创建，且不得位于任意客户端 skills 目录内。
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2.5 rounded-xl border border-line bg-canvas/70 p-4">
            <p className="text-xs font-medium text-ink-mid" aria-live="polite">
              {plan === null ? "迁移将按以下 4 步安全执行" : "目标检查通过，将迁移 " + String(plan.skills) + " 个技能"}
            </p>
            <StepList items={steps} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={busy || validationError !== null}
            data-testid="migrate-confirm-button"
            onClick={() => void handleSubmit()}
          >
            {busy ? (onPreviewMigration !== undefined && plan === null ? "检查中…" : "迁移中…") :
              onPreviewMigration !== undefined && plan === null ? "检查目标路径" : "确认迁移"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export interface SelfHealSectionProps {
  danglingCount: number;
  driftedSkills: readonly string[];
  onPruneDangling: () => Promise<void>;
  onAcceptDrifted: (skillNames: readonly string[]) => Promise<void>;
  className?: string;
}

type SelfHealConfirmKind = "prune" | "accept" | null;

/** 运维自愈区块：提供 doctor --prune（清理悬空台账）与 verify --accept（认领外部修改指纹）入口。 */
export function SelfHealSection({
  danglingCount,
  driftedSkills,
  onPruneDangling,
  onAcceptDrifted,
  className,
}: SelfHealSectionProps): React.JSX.Element {
  const [confirmKind, setConfirmKind] = useState<SelfHealConfirmKind>(null);
  const [busy, setBusy] = useState(false);
  const [driftedExpanded, setDriftedExpanded] = useState(false);

  const safeDangling = Math.max(0, danglingCount);
  const issueTotal = (safeDangling > 0 ? 1 : 0) + (driftedSkills.length > 0 ? 1 : 0);
  const healthy = issueTotal === 0;
  const visibleDrifted = driftedSkills.slice(0, DRIFTED_VISIBLE_LIMIT);
  const extraDrifted = driftedSkills.slice(DRIFTED_VISIBLE_LIMIT);

  const runConfirmedAction = async (): Promise<void> => {
    if (confirmKind === null) return;
    setBusy(true);
    try {
      if (confirmKind === "prune") {
        await onPruneDangling();
      } else {
        await onAcceptDrifted(driftedSkills);
      }
      setConfirmKind(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
      setConfirmKind(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("space-y-3", className)} data-testid="self-heal-section">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconBadge size="xs" tone={healthy ? "success" : "warning"}>
            <ShieldAuditGlyph size={14} />
          </IconBadge>
          <Label>自愈与健康检查</Label>
        </div>
        {healthy ? (
          <Badge tone="success" dot>
            状态健康
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            {String(issueTotal) + " 项待处理"}
          </Badge>
        )}
      </div>

      {healthy ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <IconBadge size="xs" tone="success">
              <CheckCircle2 className="size-3.5" strokeWidth={ICON_STROKE} />
            </IconBadge>
            <p className="text-sm text-emerald-900">未发现悬空客户端台账或内容指纹漂移。</p>
          </div>
          <Badge tone="success" dot>
            全部正常
          </Badge>
        </div>
      ) : (
        <div className="space-y-3">
          {safeDangling > 0 && (
            <div
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"
              data-testid="self-heal-dangling-row"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <IconBadge size="sm" tone="warning" className="mt-0.5">
                  <Link2Off className="size-4" strokeWidth={ICON_STROKE} />
                </IconBadge>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink-strong">
                      {String(safeDangling) + " 条悬空客户端台账记录"}
                    </p>
                    <Badge tone="warning" className="font-mono">
                      doctor --prune
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-mid">
                    对应客户端目录或软链接已不存在，清理仅移除 links.json 失效条目，不触碰本机任何文件。
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                data-testid="self-heal-prune-button"
                onClick={() => setConfirmKind("prune")}
              >
                清理悬空台账
              </Button>
            </div>
          )}

          {driftedSkills.length > 0 && (
            <div
              className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]"
              data-testid="self-heal-drifted-row"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <IconBadge size="sm" tone="warning" className="mt-0.5">
                    <FileWarning className="size-4" strokeWidth={ICON_STROKE} />
                  </IconBadge>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink-strong">
                        {String(driftedSkills.length) + " 个 Skill 内容已在外部更新"}
                      </p>
                      <Badge tone="warning" className="font-mono">
                        verify --accept
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-ink-mid">
                      认领当前技能文件夹文件内容，重算确定性 SHA-256 指纹并同步更新索引与软链接台账。
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  data-testid="self-heal-accept-button"
                  onClick={() => setConfirmKind("accept")}
                >
                  认领并同步指纹
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 pl-11">
                {visibleDrifted.map((name) => (
                  <Badge key={name} tone="warning" className="font-mono">
                    {name}
                  </Badge>
                ))}
              </div>

              {extraDrifted.length > 0 && (
                <Collapsible open={driftedExpanded} onOpenChange={setDriftedExpanded} className="pl-11">
                  <CollapsibleTrigger className="px-2.5 py-1.5 text-xs text-ink-mid">
                    <span>
                      {driftedExpanded
                        ? "收起其余 " + String(extraDrifted.length) + " 个 Skill"
                        : "展开其余 " + String(extraDrifted.length) + " 个 Skill"}
                    </span>
                    <ChevronRight
                      className={cn("motion-chevron size-3.5 text-ink-faint", driftedExpanded && "rotate-90")}
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                  </CollapsibleTrigger>
                  <CollapsiblePanel className="mt-2">
                    <div className="flex flex-wrap gap-1.5">
                      {extraDrifted.map((name) => (
                        <Badge key={name} tone="warning" className="font-mono">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </CollapsiblePanel>
                </Collapsible>
              )}
            </div>
          )}
        </div>
      )}

      {confirmKind === "prune" && (
        <ConfirmDialog
          title="确认清理悬空台账？"
          body={
            "将从 links.json 中移除 " +
            String(safeDangling) +
            " 条目标已不存在的失效记录。此操作不会修改或删除任何客户端磁盘文件。"
          }
          confirmLabel="确认清理"
          tone="default"
          busy={busy}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => void runConfirmedAction()}
        />
      )}

      {confirmKind === "accept" && (
        <ConfirmDialog
          title="确认认领外部修改并同步指纹？"
          body={
            "将为 " +
            String(driftedSkills.length) +
            " 个已漂移 Skill 重新计算 SHA-256 指纹，并原子同步更新 index.json、groups.json、stats.json 与 links.json。"
          }
          confirmLabel="确认同步指纹"
          tone="default"
          busy={busy}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => void runConfirmedAction()}
        />
      )}
    </section>
  );
}

export interface DesktopAutoLaunchSectionProps {
  isDesktop: boolean;
  autoLaunch: boolean;
  silentTray: boolean;
  onAutoLaunchChange: (next: boolean) => void | Promise<void>;
  onSilentTrayChange: (next: boolean) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

/** 桌面客户端启动与托盘巡检开关组：非桌面环境自动禁用并给出克制提示。 */
export function DesktopAutoLaunchSection({
  isDesktop,
  autoLaunch,
  silentTray,
  onAutoLaunchChange,
  onSilentTrayChange,
  disabled = false,
  className,
}: DesktopAutoLaunchSectionProps): React.JSX.Element {
  const [busyKey, setBusyKey] = useState<"autoLaunch" | "silentTray" | null>(null);
  const controlsDisabled = !isDesktop || disabled;

  const handleToggle = async (
    key: "autoLaunch" | "silentTray",
    next: boolean,
    handler: (value: boolean) => void | Promise<void>,
  ): Promise<void> => {
    setBusyKey(key);
    try {
      await handler(next);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className={cn("space-y-3", className)} data-testid="desktop-autolaunch-section">
      <SettingGroup
        title="桌面启动与托盘巡检"
        badge={!isDesktop ? <Badge tone="slate">仅在桌面客户端中可用</Badge> : undefined}
      >
        <SettingRow
          icon={<Monitor className="size-4" strokeWidth={ICON_STROKE} />}
          iconTone="surface"
          title="开机自启"
          description="登录系统后自动启动 Skills Hub 本地服务与客户端状态巡检。"
          disabled={!isDesktop}
          control={
            <Switch
              checked={autoLaunch}
              disabled={controlsDisabled || busyKey === "autoLaunch"}
              aria-label="开机自启"
              data-testid="settings-auto-launch-switch"
              onCheckedChange={(next) => void handleToggle("autoLaunch", next, onAutoLaunchChange)}
            />
          }
        />
        <SettingRow
          icon={<BellRing className="size-4" strokeWidth={ICON_STROKE} />}
          iconTone="surface"
          title="静默启动至托盘"
          description="开机时不弹出主窗口，仅在巡检发现野生真目录或同名版本冲突时推送提醒。"
          disabled={!isDesktop}
          control={
            <Switch
              checked={silentTray}
              disabled={controlsDisabled || busyKey === "silentTray"}
              aria-label="静默启动至托盘"
              data-testid="settings-silent-tray-switch"
              onCheckedChange={(next) => void handleToggle("silentTray", next, onSilentTrayChange)}
            />
          }
        />
      </SettingGroup>

      {!isDesktop && (
        <p className="text-xs text-ink-faint">
          当前通过浏览器访问本地服务；开机自启与静默托盘驻留仅在桌面客户端中可用。
        </p>
      )}
    </section>
  );
}
