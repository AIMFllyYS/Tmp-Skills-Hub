/**
 * `/playbook` 活体组件与 v0.3 目标页注册表。
 * 作用：
 * 1. 作为 `/playbook` 路由的导航结构与 import 提示唯一真源；
 * 2. 供后续前端 Sub-Issue（T1.3 #241 / T2.4 #245 / T3.3 #248 / T5.3 #253）直接对照复用，杜绝重写重复 UI。
 */

export type PlaybookSectionId =
  | "foundations"
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
    label: "色彩 / 字号 / 间距",
    subtitle: "ui-design-v1 克制灰阶体系、三档语义状态色、6 档字号与 4px 栅格节奏",
    importHint: 'import "@/index.css"; // tokens: ink-strong / ink-mid / ink-faint / line / surface',
  },
  {
    id: "atoms",
    group: "design-system",
    label: "原子控件总览",
    subtitle: "全仓唯一组件出口：按钮、徽章、开关、分段 Tab、路径字段、状态条、步骤条、抽屉与 Diff",
    importHint:
      'import { Button, Badge, Switch, SegmentedTabs, StatusBanner, PathField, StepList, Drawer, DiffViewer } from "@/components/ui/...";',
  },
  {
    id: "motion",
    group: "design-system",
    label: "统一动效实验室",
    subtitle: "motion-press / motion-fill / motion-enter / motion-row / motion-chevron / dialog-popup / drawer-popup",
    importHint: 'className="motion-press" | "motion-fill" | "motion-enter" | "motion-row" | "motion-chevron"',
  },
  {
    id: "shell-chrome",
    group: "design-system",
    label: "壳层与导航框架",
    subtitle: "真实 Sidebar 展开/收起宽度插值 + 48px 图标列 + 四板块骨架 + 设置入口",
    importHint: 'import { Sidebar } from "@/features/shell/Sidebar";',
  },
  {
    id: "t1-settings",
    group: "v03-targets",
    label: "双路径引导与设置自愈",
    subtitle: "固定 ~/.skills-hub/ 控制备份区 + 可迁移唯一真源 + 死链清理 / 漂移认领 / 桌面自启",
    issueTag: "T1.3 #241",
    importHint:
      'import { DualPathOnboardingView } from "@/features/shell/DualPathOnboardingView";\nimport { DualPathSettingsSection, MigrateStoreDialog, SelfHealSection, DesktopAutoLaunchSection } from "@/features/shell/SettingsV3Panels";',
  },
  {
    id: "t2-reconcile",
    group: "v03-targets",
    label: "启动巡检与一键接管",
    subtitle: "非阻塞顶栏提醒横幅 + 手动重扫按钮 + 备份校验/冲突预警/外部软链预览弹窗",
    issueTag: "T2.4 #245",
    importHint:
      'import { ReconcileBanner, RescanTriggerButton } from "@/features/reconcile/ReconcileBanner";\nimport { ReconcileDialog } from "@/features/reconcile/ReconcileDialog";',
  },
  {
    id: "t3-conflicts",
    group: "v03-targets",
    label: "同名多版本冲突中心",
    subtitle: "Skills 管理第三 Tab：变体卡片、mtime 欺骗预警、逐文件 Unified Diff、保留/扶正/拆分/Agent 合并",
    issueTag: "T3.3 #248",
    importHint:
      'import { ConflictsView } from "@/features/conflicts/ConflictsView";\nimport { ConflictDiffViewer } from "@/features/conflicts/ConflictDiffViewer";',
  },
  {
    id: "t5-git",
    group: "v03-targets",
    label: "Git 版本与 gh 云端备份",
    subtitle: "Git/gh 检测开关、8 位设备码 Web 登录向导、私有/公开建仓与密钥预检、单 Skill 历史抽屉",
    issueTag: "T5.3 #253",
    importHint:
      'import { GitSettingsSection } from "@/features/git/GitSettingsSection";\nimport { GhLoginDialog } from "@/features/git/GhLoginDialog";\nimport { CloudBackupDialog } from "@/features/git/CloudBackupDialog";\nimport { SkillHistoryDrawer } from "@/features/git/SkillHistoryDrawer";',
  },
];
