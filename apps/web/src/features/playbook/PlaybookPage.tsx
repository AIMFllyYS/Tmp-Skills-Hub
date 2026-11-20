import { ArrowLeft, Code2, History, RefreshCw, Sparkles } from "lucide-react";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ComponentsGridGlyph,
  ConflictConvergeGlyph,
  GitVaultGlyph,
  HubBrandMark,
  ICON_STROKE,
  IconBadge,
  IconCraftGlyph,
  LayersFrameGlyph,
  MotionCurveGlyph,
  ShellWindowGlyph,
  SingleSourceGlyph,
  SymlinkMeshGlyph,
  type GlyphProps,
} from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";
import { ConflictsView } from "@/features/conflicts/ConflictsView";
import { CloudBackupDialog } from "@/features/git/CloudBackupDialog";
import { GhLoginDialog } from "@/features/git/GhLoginDialog";
import { GitSettingsSection } from "@/features/git/GitSettingsSection";
import { SkillHistoryDrawer } from "@/features/git/SkillHistoryDrawer";
import type { GhLoginSession, GitStatusData } from "@/features/git/types";
import { ReconcileBanner, RescanTriggerButton } from "@/features/reconcile/ReconcileBanner";
import { ReconcileDialog } from "@/features/reconcile/ReconcileDialog";
import { DualPathOnboardingView } from "@/features/shell/DualPathOnboardingView";
import {
  DesktopAutoLaunchSection,
  DualPathSettingsSection,
  MigrateStoreDialog,
  SelfHealSection,
} from "@/features/shell/SettingsV3Panels";
import { cn } from "@/lib/utils";
import {
  DEMO_COMMITS,
  DEMO_COMMIT_DIFF,
  DEMO_CONFLICTS,
  DEMO_CONFLICT_DIFFS,
  DEMO_GH_LOGIN_PENDING,
  DEMO_GIT_STATUS_PRESETS,
  DEMO_RECONCILE_PREVIEW,
  DEMO_RECONCILE_SUMMARY,
  DEMO_SECRET_FINDINGS,
} from "./fixtures.js";
import { PlaybookDesignSystemView } from "./PlaybookAtomsSection.js";
import { PLAYBOOK_SECTIONS, type PlaybookSectionId } from "./registry.js";

const GIT_PRESET_TABS: SegmentedTabItem<"connected" | "no-git" | "diverged">[] = [
  { id: "connected", label: "已连云端" },
  { id: "no-git", label: "未装 Git" },
  { id: "diverged", label: "远端分叉" },
];

const SECTION_GLYPH: Record<PlaybookSectionId, ComponentType<GlyphProps>> = {
  foundations: LayersFrameGlyph,
  icons: IconCraftGlyph,
  atoms: ComponentsGridGlyph,
  motion: MotionCurveGlyph,
  "shell-chrome": ShellWindowGlyph,
  "t1-settings": SingleSourceGlyph,
  "t2-reconcile": SymlinkMeshGlyph,
  "t3-conflicts": ConflictConvergeGlyph,
  "t5-git": GitVaultGlyph,
};

/**
 * `/playbook` 活体商务设计系统与 v0.3 目标页面原型路由。
 * 所有页面与弹窗均直接引用真实业务组件（零一次性死代码），供前端 Sub-Issue（T1.3 / T2.4 / T3.3 / T5.3）直接 import 接线。
 */
export function PlaybookPage(): React.JSX.Element {
  const [section, setSection] = useState<PlaybookSectionId>("foundations");
  const [showImportCode, setShowImportCode] = useState(false);

  // T1.3 interactive preview state
  const [skillsRoot, setSkillsRoot] = useState("C:\\Users\\AIMFl\\.skills-hub\\skills");
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [danglingCount, setDanglingCount] = useState(360);
  const [driftedSkills, setDriftedSkills] = useState<readonly string[]>(["vps-init", "docx", "pptx", "xlsx"]);
  const [isDesktopPreview, setIsDesktopPreview] = useState(true);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [silentTray, setSilentTray] = useState(true);

  // T2.4 interactive preview state
  const [bannerVisible, setBannerVisible] = useState(true);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [includeExternalLinks, setIncludeExternalLinks] = useState(false);
  const [scanning, setScanning] = useState(false);

  // T3.3 interactive preview state
  const [conflicts, setConflicts] = useState(DEMO_CONFLICTS);
  const [selectedConflictName, setSelectedConflictName] = useState<string | null>(
    DEMO_CONFLICTS[0]?.skillName ?? null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    DEMO_CONFLICTS[0]?.variants[1]?.variantId ?? null,
  );
  const [diffLoading, setDiffLoading] = useState(false);
  const [lastAgentPrompt, setLastAgentPrompt] = useState<string | null>(null);

  // T5.3 interactive preview state
  const [gitPreset, setGitPreset] = useState<"connected" | "no-git" | "diverged">("connected");
  const [gitStatus, setGitStatus] = useState<GitStatusData>(DEMO_GIT_STATUS_PRESETS.connected);
  const [ghLoginOpen, setGhLoginOpen] = useState(false);
  const [ghSession, setGhSession] = useState<GhLoginSession | null>(DEMO_GH_LOGIN_PENDING);
  const [cloudBackupOpen, setCloudBackupOpen] = useState(false);
  const [showSecretFixture, setShowSecretFixture] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const activeMeta = PLAYBOOK_SECTIONS.find((s) => s.id === section) ?? PLAYBOOK_SECTIONS[0]!;
  const ActiveGlyph = SECTION_GLYPH[activeMeta.id];
  const designSections = PLAYBOOK_SECTIONS.filter((s) => s.group === "design-system");
  const targetSections = PLAYBOOK_SECTIONS.filter((s) => s.group === "v03-targets");

  const activeConflict =
    conflicts.find((c) => c.skillName === selectedConflictName) ?? conflicts[0] ?? null;
  const effectiveVariantId =
    selectedVariantId ??
    activeConflict?.variants.find((v) => v.isActive !== true)?.variantId ??
    null;

  const openReconcileWithLateLoad = (): void => {
    setReconcileOpen(true);
    setReconcileLoading(true);
    window.setTimeout(() => setReconcileLoading(false), 620);
  };

  const openHistoryWithLateLoad = (): void => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    window.setTimeout(() => setHistoryLoading(false), 580);
  };

  return (
    <div className="flex h-full min-h-0 w-full bg-canvas" data-testid="playbook-root">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-canvas">
        <div className="flex h-16 shrink-0 items-center justify-between gap-2.5 border-b border-line bg-white/80 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconBadge size="sm" tone="obsidian">
              <HubBrandMark size={17} />
            </IconBadge>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-ink-strong">
                Skills Hub
              </p>
              <p className="truncate text-[11px] text-ink-faint">Design System &amp; Playbook</p>
            </div>
          </div>
          <Badge tone="slate" className="shrink-0 font-mono text-[11px]">
            v0.3
          </Badge>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <nav className="flex flex-col gap-6 p-3.5" aria-label="Playbook 导航">
            <div className="space-y-1">
              <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                商务极简设计系统
              </p>
              {designSections.map((item) => {
                const Glyph = SECTION_GLYPH[item.id];
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={"playbook-nav-" + item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "motion-row flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left text-sm outline-none",
                      active
                        ? "border-line bg-white font-medium text-ink-strong shadow-[var(--shadow-thumb)]"
                        : "border-transparent text-ink-mid hover:bg-white/65 hover:text-ink-strong",
                    )}
                  >
                    <Glyph
                      size={16}
                      className={active ? "text-ink-strong" : "text-ink-faint"}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1">
              <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                v0.3 目标页面与弹窗
              </p>
              {targetSections.map((item) => {
                const Glyph = SECTION_GLYPH[item.id];
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={"playbook-nav-" + item.id}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "motion-row flex w-full items-center justify-between gap-2 rounded-[10px] border px-2.5 py-2 text-left text-sm outline-none",
                      active
                        ? "border-line bg-white font-medium text-ink-strong shadow-[var(--shadow-thumb)]"
                        : "border-transparent text-ink-mid hover:bg-white/65 hover:text-ink-strong",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                      <Glyph
                        size={16}
                        className={active ? "text-ink-strong" : "text-ink-faint"}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.issueTag !== undefined && (
                      <Badge
                        tone={active ? "slate" : "neutral"}
                        className="shrink-0 px-1.5 py-0 font-mono text-[10px]"
                      >
                        {item.issueTag}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        </ScrollArea>

        <div className="border-t border-line bg-white/75 p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              window.location.assign("/");
            }}
          >
            <ArrowLeft className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
            返回主应用（/）
          </Button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-7 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <IconBadge size="md" tone={activeMeta.group === "v03-targets" ? "obsidian" : "neutral"}>
              <ActiveGlyph size={18} />
            </IconBadge>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-ink-strong">{activeMeta.label}</h1>
                {activeMeta.issueTag !== undefined && (
                  <Badge tone="success" dot className="font-mono">
                    {activeMeta.issueTag}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-mid">{activeMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={showImportCode ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowImportCode((v) => !v)}
            >
              <Code2 className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
              {showImportCode ? "收起 Import" : "查看 Import"}
            </Button>
            <CopyButton
              value={activeMeta.importHint}
              label="复制组件 Import"
              copiedLabel="已复制 Import"
              onError={() => toast.error("复制失败")}
            />
          </div>
        </header>

        {showImportCode && (
          <div className="motion-enter shrink-0 border-b border-line bg-surface/85 px-7 py-2.5">
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-ink-strong">
              {activeMeta.importHint}
            </pre>
          </div>
        )}

        <ScrollArea key={section} className="min-h-0 flex-1">
          <div className="motion-enter mx-auto max-w-6xl space-y-6 px-7 py-7">
            {(section === "foundations" ||
              section === "icons" ||
              section === "atoms" ||
              section === "motion" ||
              section === "shell-chrome") && (
              <PlaybookDesignSystemView section={section} onNotice={(text) => toast(text)} />
            )}

            {section === "t1-settings" && (
              <div className="space-y-6">
                <Card className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-ink-strong">
                        1. 设置面板 v0.3 分区（SettingsV3Panels）
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-mid">可直接嵌入现有 SettingsDialog.tsx 中</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsDesktopPreview((v) => !v)}
                    >
                      切换运行端：{isDesktopPreview ? "Electron 桌面端" : "纯浏览器 Web"}
                    </Button>
                  </div>
                  <DualPathSettingsSection
                    stateRoot="C:\Users\AIMFl\.skills-hub"
                    skillsRoot={skillsRoot}
                    stateDiskBytes={19_320_400}
                    layoutMode="split"
                    onOpenMigrate={() => setMigrateOpen(true)}
                  />
                  <Separator />
                  <SelfHealSection
                    danglingCount={danglingCount}
                    driftedSkills={driftedSkills}
                    onPruneDangling={async () => {
                      setDanglingCount(0);
                      toast.success("已模拟清理 360 条悬空台账记录");
                    }}
                    onAcceptDrifted={async (names) => {
                      setDriftedSkills([]);
                      toast.success("已模拟认领并同步 " + String(names.length) + " 个漂移指纹");
                    }}
                  />
                  <Separator />
                  <DesktopAutoLaunchSection
                    isDesktop={isDesktopPreview}
                    autoLaunch={autoLaunch}
                    silentTray={silentTray}
                    onAutoLaunchChange={(next) => {
                      setAutoLaunch(next);
                      toast(next ? "已开启开机自启" : "已关闭开机自启");
                    }}
                    onSilentTrayChange={(next) => {
                      setSilentTray(next);
                      toast(next ? "已开启托盘静默启动" : "已关闭托盘静默启动");
                    }}
                  />
                </Card>

                <Card className="overflow-hidden p-0">
                  <div className="flex items-center justify-between border-b border-line bg-canvas px-5 py-3 text-xs font-medium text-ink-mid">
                    <span>2. 首次初始化双目录引导页预览（DualPathOnboardingView）</span>
                    <Badge tone="slate">纯 Prop 驱动</Badge>
                  </div>
                  <DualPathOnboardingView
                    title="总览"
                    clientCount={30}
                    gitDetected
                    gitVersion="2.47.1"
                    onInit={async (opts) => {
                      toast.success(
                        "初始化触发：skillsRoot=" +
                          (opts.skillsRoot ?? "~/.skills-hub/skills") +
                          "，enableGit=" +
                          String(opts.enableGit === true),
                      );
                    }}
                    onOpenAgent={() => toast("切入 Agent 页面")}
                  />
                </Card>

                <MigrateStoreDialog
                  open={migrateOpen}
                  onOpenChange={setMigrateOpen}
                  currentSkillsRoot={skillsRoot}
                  managedLinkCount={286}
                  onMigrate={async (target) => {
                    setSkillsRoot(target);
                    toast.success("已模拟迁移唯一真源至 " + target);
                  }}
                />
              </div>
            )}

            {section === "t2-reconcile" && (
              <div className="space-y-6">
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-ink-strong">
                        启动巡检提醒横幅 &amp; 手动重扫按钮
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-mid">
                        挂载在主区顶部；L1 浅扫耗时约 14ms，严禁定时器轮询。弹窗打开自带晚加载骨架过渡。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RescanTriggerButton
                        scanning={scanning}
                        onRescan={() => {
                          setScanning(true);
                          window.setTimeout(() => {
                            setScanning(false);
                            setBannerVisible(true);
                            toast.success("L1 极速重扫完成（14ms）：检出 92 处未接管目录与 6 项冲突");
                          }, 500);
                        }}
                      />
                      <Button size="sm" variant="outline" onClick={openReconcileWithLateLoad}>
                        演示弹窗晚加载骨架
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setReconcileLoading(false);
                          setReconcileOpen(true);
                        }}
                      >
                        打开一键合并弹窗
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
                    {bannerVisible ? (
                      <ReconcileBanner
                        summary={DEMO_RECONCILE_SUMMARY}
                        onOpenDialog={openReconcileWithLateLoad}
                        onDismiss={() => setBannerVisible(false)}
                      />
                    ) : (
                      <div className="flex items-center justify-between bg-canvas px-4 py-3 text-xs text-ink-mid">
                        <span>横幅已暂时收起，点击「重新扫描」可再次触发检查。</span>
                        <Button size="sm" variant="outline" onClick={() => setBannerVisible(true)}>
                          恢复显示横幅
                        </Button>
                      </div>
                    )}
                    <div className="p-6 text-sm text-ink-mid">主区内容区域占位（横幅非阻塞显示在主区顶部）</div>
                  </div>
                </Card>

                <ReconcileDialog
                  open={reconcileOpen}
                  onOpenChange={setReconcileOpen}
                  preview={DEMO_RECONCILE_PREVIEW}
                  loading={reconcileLoading}
                  includeExternalLinks={includeExternalLinks}
                  onIncludeExternalLinksChange={setIncludeExternalLinks}
                  onApply={async () => {
                    setReconcileOpen(false);
                    setBannerVisible(false);
                    toast.success("已完成备份校验与纯软链接接管（其中 2 项进入冲突处理中心）");
                  }}
                />
              </div>
            )}

            {section === "t3-conflicts" && (
              <div className="space-y-4">
                {lastAgentPrompt !== null && (
                  <Card className="space-y-2 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-strong">
                        <Sparkles className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
                        已触发一键跳转 Agent 分析合并（预填提示词预览）
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setLastAgentPrompt(null)}>
                        关闭
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-xl border border-line bg-canvas p-3 font-mono text-xs text-ink-mid">
                      {lastAgentPrompt}
                    </pre>
                  </Card>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDiffLoading(true);
                      window.setTimeout(() => setDiffLoading(false), 620);
                    }}
                  >
                    <RefreshCw className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
                    演示 Diff 晚加载骨架
                  </Button>
                  {conflicts.length === 0 && (
                    <Button size="sm" variant="outline" onClick={() => setConflicts(DEMO_CONFLICTS)}>
                      重置示例冲突数据
                    </Button>
                  )}
                </div>

                <div className="h-[640px] overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
                  <ConflictsView
                    conflicts={conflicts}
                    selectedSkillName={activeConflict?.skillName ?? null}
                    onSelectSkill={(name) => {
                      setSelectedConflictName(name);
                      const next = conflicts.find((c) => c.skillName === name);
                      setSelectedVariantId(next?.variants.find((v) => v.isActive !== true)?.variantId ?? null);
                    }}
                    selectedVariantId={effectiveVariantId}
                    onSelectVariant={(variantId) => {
                      setSelectedVariantId(variantId);
                      setDiffLoading(true);
                      window.setTimeout(() => setDiffLoading(false), 260);
                    }}
                    diffFiles={
                      effectiveVariantId !== null ? (DEMO_CONFLICT_DIFFS[effectiveVariantId] ?? []) : []
                    }
                    loadingDiff={diffLoading}
                    onKeepActive={async (skillName) => {
                      setConflicts((prev) => prev.filter((c) => c.skillName !== skillName));
                      toast.success("已保留 " + skillName + " 当前真源，其余变体已归档至 archive/conflicts/");
                    }}
                    onPromoteVariant={async (skillName, variantId) => {
                      setConflicts((prev) => prev.filter((c) => c.skillName !== skillName));
                      toast.success("已将变体 " + variantId + " 扶正为 " + skillName + " 唯一真源");
                    }}
                    onSplitVariant={async (skillName, variantId, newName) => {
                      toast.success("已将变体 " + variantId + " 拆分为独立 Skill: " + newName + "（原：" + skillName + "）");
                    }}
                    onHandoffToAgent={(skillName, prompt) => {
                      setLastAgentPrompt(prompt);
                      toast("已生成 " + skillName + " 的 Agent 融合上下文，准备切入 Agent 审批流");
                    }}
                  />
                </div>
              </div>
            )}

            {section === "t5-git" && (
              <div className="space-y-6">
                <Card className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold tracking-tight text-ink-strong">
                        Git 版本控制与云端备份设置卡片
                      </h2>
                      <p className="mt-0.5 text-xs text-ink-mid">
                        切换三种环境预设，验证安装提示、开关与远端分叉保护。
                      </p>
                    </div>
                    <SegmentedTabs
                      size="sm"
                      ariaLabel="Git 预设状态"
                      value={gitPreset}
                      items={GIT_PRESET_TABS}
                      onChange={(next) => {
                        setGitPreset(next);
                        setGitStatus(DEMO_GIT_STATUS_PRESETS[next]);
                      }}
                    />
                  </div>

                  <GitSettingsSection
                    status={gitStatus}
                    onToggleGit={async (enabled) => {
                      setGitStatus((prev) => ({ ...prev, enabled }));
                      toast(enabled ? "已开启真源 Git 版本控制" : "已关闭 Git 版本控制（优雅降级纯文件系统）");
                    }}
                    onOpenGhLogin={() => {
                      setGhSession(DEMO_GH_LOGIN_PENDING);
                      setGhLoginOpen(true);
                    }}
                    onOpenCloudSetup={() => setCloudBackupOpen(true)}
                    onPushBackup={async () => {
                      setGitStatus((prev) => ({ ...prev, aheadCount: 0 }));
                      toast.success("已安全推送至 GitHub 云端备份仓");
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setGhSession(DEMO_GH_LOGIN_PENDING);
                        setGhLoginOpen(true);
                      }}
                    >
                      演示 gh 设备码登录向导
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowSecretFixture(true);
                        setCloudBackupOpen(true);
                      }}
                    >
                      演示一键建仓（含 Public 密钥预检）
                    </Button>
                    <Button size="sm" variant="outline" onClick={openHistoryWithLateLoad}>
                      <History className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
                      演示单 Skill 历史抽屉（含晚加载）
                    </Button>
                  </div>
                </Card>

                <GhLoginDialog
                  open={ghLoginOpen}
                  onOpenChange={setGhLoginOpen}
                  session={ghSession}
                  onStartLogin={async () => {
                    setGhSession(DEMO_GH_LOGIN_PENDING);
                  }}
                  onCopyAndOpen={(code) => {
                    toast("已复制设备码 " + code + "；1.5 秒后模拟授权完成");
                    window.setTimeout(() => {
                      setGhSession({
                        ...DEMO_GH_LOGIN_PENDING,
                        status: "authenticated",
                        username: "AIMFllyYS",
                      });
                    }, 1500);
                  }}
                />

                <CloudBackupDialog
                  open={cloudBackupOpen}
                  onOpenChange={setCloudBackupOpen}
                  {...(showSecretFixture ? { secretFindings: DEMO_SECRET_FINDINGS } : {})}
                  onCreateAndPush={async (input) => {
                    setCloudBackupOpen(false);
                    toast.success("已模拟创建 " + input.visibility + " 备份仓：" + input.repoName);
                  }}
                />

                <SkillHistoryDrawer
                  open={historyOpen}
                  onOpenChange={setHistoryOpen}
                  skillName="hyperframes"
                  commits={DEMO_COMMITS}
                  loading={historyLoading}
                  gitEnabled={gitStatus.enabled}
                  selectedDiffFiles={DEMO_COMMIT_DIFF}
                  onSelectCommit={(hash) => toast("加载提交 " + hash.slice(0, 7) + " Diff")}
                />
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
