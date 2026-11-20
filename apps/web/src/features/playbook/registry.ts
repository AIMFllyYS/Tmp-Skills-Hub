/**
 * `/playbook` 活体组件与 v0.3 目标页注册表。
 * 作用：
 * 1. 作为 `/playbook` 路由的导航结构与 import 提示唯一真源；
 * 2. 供后续前端 Sub-Issue（T1.3 #241 / T2.4 #245 / T3.3 #248 / T5.3 #253）直接对照复用，杜绝重写重复 UI。
 */

export type PlaybookSectionId =
  | "foundations"
  | "icons"
  | "atoms"
  | "motion"
  | "shell-chrome"
  | "t1-settings"
  | "t2-reconcile"
  | "t3-conflicts"
  | "t5-git";

export interface PlaybookSectionMeta {
  id: PlaybookSectionId;
  group: "design-system" | "v03-targets";
  label: string;
  subtitle: string;
  issueTag?: string;
  importHint: string;
}

export const PLAYBOOK_SECTIONS: readonly PlaybookSectionMeta[] = [
  {
    id: "foundations",
    group: "design-system",
    label: "色彩 · 圆角与排版",
    subtitle: "温润黑曜石/雪花石膏中性灰阶、同心圆角几何、克制微高度 Token 与 6 档排版体系",
    importHint: 'import "@/index.css"; // bg-canvas / bg-surface / ink-strong / --shadow-card / --shadow-lift',
  },
  {
    id: "icons",
    group: "design-system",
    label: "图标与建筑感徽标",
    subtitle: "11 枚自绘几何 SVG 领域图标、IconBadge 七态四尺寸矩阵与 strokeWidth=1.6 线宽规范",
    importHint:
      'import { HubBrandMark, IconBadge, ICON_STROKE, SingleSourceGlyph, SymlinkMeshGlyph } from "@/components/ui/icon";',
  },
  {
    id: "atoms",
    group: "design-system",
    label: "完整商务原子组件",
    subtitle: "全仓统一出口：表单、SearchInput/Kbd、MetricCard、SettingRow、Table/Menu、Toast、EmptyState、Drawer 与 Diff",
    importHint:
      'import { Button, Badge, MetricCard, SearchInput, SettingGroup, SettingRow, EmptyState, CopyButton, Drawer, DiffViewer } from "@/components/ui/...";',
  },
  {
    id: "motion",
    group: "design-system",
    label: "动效与晚加载实验室",
    subtitle: "DeferredReveal 异步骨架解码、StaggerItem 级联、LazyViewportSection 视口懒加载与 0.35× 慢放审校",
    importHint:
      'import { DeferredReveal, StaggerItem, LazyViewportSection } from "@/components/ui/deferred-reveal";',
  },
  {
    id: "shell-chrome",
    group: "design-system",
    label: "壳层与导航框架",
    subtitle: "真实 Sidebar 展开/收起宽度插值 + 48px 图标列 + 顶栏晚加载骨架切换预览",
    importHint: 'import { Sidebar } from "@/features/shell/Sidebar";',
  },
  {
    id: "t1-settings",
    group: "v03-targets",
    label: "双路径与设置自愈",
    subtitle: "固定 ~/.skills-hub/ 控制备份区 + 可迁移唯一真源 + 死链清理 / 漂移认领 / 桌面自启",
    issueTag: "T1.3 #241",
    importHint:
      'import { DualPathOnboardingView } from "@/features/shell/DualPathOnboardingView";\nimport { DualPathSettingsSection, MigrateStoreDialog, SelfHealSection, DesktopAutoLaunchSection } from "@/features/shell/SettingsV3Panels";',
  },
  {
    id: "t2-reconcile",
    group: "v03-targets",
    label: "启动巡检与接管",
    subtitle: "非阻塞顶栏提醒横幅 + 手动重扫按钮 + 含晚加载骨架态的备份校验/冲突预警预览弹窗",
    issueTag: "T2.4 #245",
    importHint:
      'import { ReconcileBanner, RescanTriggerButton } from "@/features/reconcile/ReconcileBanner";\nimport { ReconcileDialog } from "@/features/reconcile/ReconcileDialog";',
  },
  {
    id: "t3-conflicts",
    group: "v03-targets",
    label: "同名冲突处理中心",
    subtitle: "Skills 管理第三 Tab：变体交错卡片、mtime 欺骗预警、晚加载 Unified Diff 与 Agent 融合",
    issueTag: "T3.3 #248",
    importHint:
      'import { ConflictsView } from "@/features/conflicts/ConflictsView";\nimport { ConflictDiffViewer } from "@/features/conflicts/ConflictDiffViewer";',
  },
  {
    id: "t5-git",
    group: "v03-targets",
    label: "Git 与云端备份",
    subtitle: "Git/gh 检测开关、8 位设备码 Web 登录向导、私有/公开建仓密钥预检与单 Skill 历史抽屉",
    issueTag: "T5.3 #253",
    importHint:
      'import { GitSettingsSection } from "@/features/git/GitSettingsSection";\nimport { GhLoginDialog } from "@/features/git/GhLoginDialog";\nimport { CloudBackupDialog } from "@/features/git/CloudBackupDialog";\nimport { SkillHistoryDrawer } from "@/features/git/SkillHistoryDrawer";',
  },
];
