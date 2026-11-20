import { Check, ChevronRight, FolderGit2, Layers, Sparkles } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DiffViewer, type UnifiedDiffFile } from "@/components/ui/diff-viewer";
import { Drawer } from "@/components/ui/drawer";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PathField } from "@/components/ui/path-field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { StepList, type StepItem } from "@/components/ui/step-list";
import { Switch } from "@/components/ui/switch";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";
import { Sidebar } from "@/features/shell/Sidebar";
import type { AppPage } from "@/features/shell/page";
import { cn } from "@/lib/utils";
import type { PlaybookSectionId } from "./registry.js";

const SAMPLE_DIFF: UnifiedDiffFile[] = [
  {
    relPath: "SKILL.md",
    status: "modified",
    hunks: [
      {
        header: "@@ -1,6 +1,8 @@",
        lines: [
          { kind: "context", oldLine: 1, newLine: 1, text: "---" },
          { kind: "context", oldLine: 2, newLine: 2, text: "name: hyperframes" },
          { kind: "del", oldLine: 3, text: "description: Render HTML motion compositions." },
          { kind: "add", newLine: 3, text: "description: Render HTML motion compositions with deterministic Windows timing." },
          { kind: "context", oldLine: 4, newLine: 4, text: "---" },
          { kind: "add", newLine: 5, text: "## Windows 坑点补充" },
          { kind: "add", newLine: 6, text: "- 使用 junction 时避免在脚本内清空目录子项。" },
        ],
      },
    ],
  },
  {
    relPath: "scripts/render.mjs",
    status: "added",
    hunks: [
      {
        header: "@@ -0,0 +1,2 @@",
        lines: [
          { kind: "add", newLine: 1, text: "export const FPS = 60;" },
          { kind: "add", newLine: 2, text: "export const CODEC = 'h264';" },
        ],
      },
    ],
  },
];

const SAMPLE_STEPS: StepItem[] = [
  { id: "1", title: "生成去重客户端备份快照并校验 SHA-256", detail: "~/.skills-hub/backups/2026-11-20T14-00-00Z", status: "done" },
  { id: "2", title: "将 6 个同名多版本变体安全落盘冲突池", detail: "~/.skills-hub/conflicts/ (零数据丢失)", status: "active" },
  { id: "3", title: "原地挂回 100% 纯软链接 (NTFS Junction)", detail: "按 tmp/ journal 原子切换，失败逆序回滚", status: "idle" },
];

const DEMO_TABS: SegmentedTabItem<"apps" | "content" | "conflicts">[] = [
  { id: "apps", label: "应用" },
  { id: "content", label: "内容" },
  { id: "conflicts", label: "冲突", badge: 6 },
];

export function PlaybookDesignSystemView({
  section,
  onNotice,
}: {
  section: Extract<PlaybookSectionId, "foundations" | "atoms" | "motion" | "shell-chrome">;
  onNotice: (text: string) => void;
}): React.JSX.Element {
  const [demoTab, setDemoTab] = useState<"apps" | "content" | "conflicts">("conflicts");
  const [demoSwitch, setDemoSwitch] = useState(true);
  const [demoCheck, setDemoCheck] = useState(true);
  const [demoSelect, setDemoSelect] = useState("private");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [enterKey, setEnterKey] = useState(0);
  const [chevronOpen, setChevronOpen] = useState(false);
  const [barKey, setBarKey] = useState(0);
  const [shellPage, setShellPage] = useState<AppPage>("skills");
  const [shellCollapsed, setShellCollapsed] = useState(false);

  if (section === "foundations") {
    const swatches = [
      { name: "bg-white", token: "#ffffff", cls: "bg-white border border-line" },
      { name: "bg-surface", token: "#f9fafb", cls: "bg-surface border border-line" },
      { name: "border-line", token: "#e5e7eb", cls: "bg-line" },
      { name: "ink-faint", token: "#9ca3af", cls: "bg-ink-faint" },
      { name: "ink-mid", token: "#4b5563", cls: "bg-ink-mid" },
      { name: "ink-strong", token: "#030712", cls: "bg-ink-strong" },
    ];
    return (
      <div className="space-y-6">
        <Card className="space-y-4">
          <div>
            <h3 className="text-base font-medium text-ink-strong">灰阶主色板（无渐变 / 无品牌强调色）</h3>
            <p className="mt-1 text-sm text-ink-mid">控件、导航、按钮统一走灰阶；颜色仅用于语义状态与图表/文件树例外。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {swatches.map((s) => (
              <div key={s.name} className="space-y-1.5">
                <div className={cn("h-12 rounded-lg", s.cls)} />
                <p className="font-mono text-xs font-medium text-ink-strong">{s.name}</p>
                <p className="font-mono text-xs text-ink-faint">{s.token}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge tone="neutral">中性态 bg-surface</Badge>
            <Badge tone="success">成功态 green-700 / green-50</Badge>
            <Badge tone="warning">警告态 amber-800 / amber-50</Badge>
            <Badge tone="danger">错误态 red-700 / red-50</Badge>
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-base font-medium text-ink-strong">字号与字重档位（标题上限 semibold）</h3>
          <div className="divide-y divide-line">
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-2xl font-semibold tracking-tight text-ink-strong">页面标题 24px Semibold</span>
              <code className="font-mono text-xs text-ink-faint">text-2xl font-semibold tracking-tight</code>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-base font-medium text-ink-strong">区块标题 16px Medium</span>
              <code className="font-mono text-xs text-ink-faint">text-base font-medium</code>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-sm font-medium text-ink-strong">条目标题 14px Medium</span>
              <code className="font-mono text-xs text-ink-faint">text-sm font-medium</code>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-sm text-ink-mid">正文说明 14px Regular</span>
              <code className="font-mono text-xs text-ink-faint">text-sm text-ink-mid</code>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <span className="font-mono text-xs text-ink-strong">C:\Users\AIMFl\.skills-hub\skills</span>
              <code className="font-mono text-xs text-ink-faint">font-mono text-xs</code>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (section === "atoms") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="space-y-4">
            <h3 className="text-base font-medium text-ink-strong">按钮、开关、复选框与分段 Tab（含徽章）</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => onNotice("触发主按钮")}>主按钮</Button>
              <Button variant="outline" onClick={() => onNotice("触发次按钮")}>次按钮</Button>
              <Button variant="ghost">幽灵按钮</Button>
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}>危险确认</Button>
              <Button size="sm" variant="outline">小号按钮</Button>
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm text-ink-strong">
                <Switch checked={demoSwitch} onCheckedChange={setDemoSwitch} />
                <span>Git 版本控制（{demoSwitch ? "已开启" : "已关闭"}）</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-strong">
                <Checkbox checked={demoCheck} onCheckedChange={(v) => setDemoCheck(v === true)} />
                <span>纳入外部软链接</span>
              </label>
            </div>
            <div className="pt-1">
              <SegmentedTabs value={demoTab} onChange={setDemoTab} items={DEMO_TABS} ariaLabel="示例标签" />
            </div>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-base font-medium text-ink-strong">输入、下拉与只读路径字段（PathField）</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pb-input">仓库名</Label>
                <Input id="pb-input" defaultValue="my-skills-hub-backup" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pb-select">可见性</Label>
                <NativeSelect id="pb-select" value={demoSelect} onChange={(e) => setDemoSelect(e.target.value)}>
                  <option value="private">Private（私有推荐）</option>
                  <option value="public">Public（公开）</option>
                </NativeSelect>
              </div>
            </div>
            <PathField
              label="固定控制与备份中心"
              tag="默认固定"
              hint="占用 18.4 MB"
              path="C:\Users\AIMFl\.skills-hub"
              trailing={
                <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>
                  打开抽屉
                </Button>
              }
            />
          </Card>
        </div>

        <Card className="space-y-3">
          <h3 className="text-base font-medium text-ink-strong">状态提醒横幅（StatusBanner）</h3>
          <StatusBanner
            surface="card"
            tone="warning"
            title="检测到 6 个同名多版本冲突与 74 个本地新增 skill"
            description="点击右侧按钮可预览备份与纯软链接接管方案。"
            action={<Button size="sm" onClick={() => onNotice("打开接管预览")}>查看并合并</Button>}
          />
          <StatusBanner
            surface="card"
            tone="success"
            title="所有客户端目录均为 100% 纯软链接投影"
            description="最近 L1 极速扫描耗时 11ms，零野生真目录。"
          />
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h3 className="text-base font-medium text-ink-strong">步骤清单（StepList）与折叠卡（Collapsible）</h3>
            <StepList items={SAMPLE_STEPS} />
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger>
                <span>展开查看骨架加载示例</span>
                <span className="text-xs text-ink-faint">Skeleton</span>
              </CollapsibleTrigger>
              <CollapsiblePanel className="mt-2 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-9 w-full" />
              </CollapsiblePanel>
            </Collapsible>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-base font-medium text-ink-strong">KPI 卡片与统一 DiffViewer 预览</h3>
            <div className="grid grid-cols-2 gap-3">
              <Card className="motion-press cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <CardTitle>唯一真源 Skills</CardTitle>
                <CardValue>157</CardValue>
              </Card>
              <Card className="motion-press cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <CardTitle>待解决冲突</CardTitle>
                <CardValue>6</CardValue>
              </Card>
            </div>
            <DiffViewer files={SAMPLE_DIFF} />
          </Card>
        </div>

        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title="统一右侧抽屉（Drawer）"
          description="无毛玻璃、无大阴影，--ease-smooth 滑入，复用于单 Skill Git 历史抽屉。"
          footer={<Button variant="outline" onClick={() => setDrawerOpen(false)}>关闭</Button>}
        >
          <StepList items={SAMPLE_STEPS} />
        </Drawer>

        {confirmOpen && (
          <ConfirmDialog
            title="确认执行受保护操作？"
            body="高风险写盘统一走 ConfirmDialog 二次确认，零真删除。"
            confirmLabel="确认执行"
            tone="danger"
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              onNotice("已通过二次确认");
            }}
          />
        )}
      </div>
    );
  }

  if (section === "motion") {
    return (
      <div className="space-y-6">
        <Card className="space-y-4">
          <div>
            <h3 className="text-base font-medium text-ink-strong">统一动效类别实验室（严禁业务手写 duration/ease）</h3>
            <p className="mt-1 text-sm text-ink-mid">
              点击下方样本体验 `motion-press`、`motion-row`、`motion-enter`、`motion-chevron` 与 `animate-bar-in`。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-ink-strong">motion-enter (page-in)</span>
                <Button size="sm" variant="outline" onClick={() => setEnterKey((k) => k + 1)}>
                  重放切页入场
                </Button>
              </div>
              <div key={enterKey} className="motion-enter rounded-lg border border-line bg-surface p-3 text-sm text-ink-strong">
                <Sparkles className="mr-1.5 inline size-4 text-ink-mid" aria-hidden />
                opacity 0→1 + translateY(4px→0)，520ms --ease-smooth（唯一切页刷新方式）
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-ink-strong">motion-chevron + motion-row</span>
                <Badge>spring 300ms</Badge>
              </div>
              <button
                type="button"
                onClick={() => setChevronOpen((v) => !v)}
                className="motion-row flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-strong hover:bg-surface"
              >
                <span className="flex items-center gap-2">
                  <ChevronRight className={cn("motion-chevron size-4 text-ink-mid", chevronOpen && "rotate-90")} aria-hidden />
                  点击按压 scale(0.98) + 弹簧旋转
                </span>
                <Check className={cn("size-4 text-green-700", !chevronOpen && "opacity-0")} aria-hidden />
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-line p-4 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-ink-strong">animate-bar-in (scaleX 500ms)</span>
                <Button size="sm" variant="outline" onClick={() => setBarKey((k) => k + 1)}>
                  重放微进度条
                </Button>
              </div>
              <div key={barKey} className="space-y-2 pt-1">
                {[88, 64, 42].map((pct) => (
                  <div key={pct} className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div className="animate-bar-in h-full rounded-full bg-ink-strong" style={{ width: `${pct}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-medium text-ink-strong">真实左侧栏（Sidebar）展开 / 收起交互预览</h3>
          <p className="mt-1 text-sm text-ink-mid">
            直接复用 `@/features/shell/Sidebar`：48px 图标列 + 文案淡出，导航严格保持纵向 `flex-col`。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShellCollapsed((c) => !c)}>
          {shellCollapsed ? "展开侧栏" : "收起侧栏"}
        </Button>
      </div>
      <div className="flex h-80 overflow-hidden rounded-xl border border-line bg-white">
        <div
          className="sidebar-preview-rail border-r border-line"
          style={{ width: shellCollapsed ? 48 : 224 }}
        >
          <Sidebar
            page={shellPage}
            collapsed={shellCollapsed}
            settingsOpen={false}
            onPage={setShellPage}
            onSettings={() => onNotice("左下角设置入口 → 打开 SettingsDialog")}
            onToggleCollapsed={() => setShellCollapsed((c) => !c)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between p-5">
          <div key={shellPage} className="motion-enter space-y-2">
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <Layers className="size-3.5" aria-hidden />
              <span>主区切页仅用 key + motion-enter</span>
            </div>
            <p className="text-lg font-semibold text-ink-strong">当前模拟板块：{shellPage}</p>
            <p className="text-sm text-ink-mid">
              保持总览 / 统计 / Skills 管理（含应用·内容·冲突三 Tab）/ Agent 四板块，不让一级导航膨胀。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <FolderGit2 className="size-3.5" aria-hidden />
            <span>点击左侧任意板块或折叠按钮体验完整交互</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
