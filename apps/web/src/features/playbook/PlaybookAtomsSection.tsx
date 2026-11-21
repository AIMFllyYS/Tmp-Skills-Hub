import {
  Archive,
  Bell,
  Copy,
  FolderGit2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button";
import { DeferredReveal, StaggerItem } from "@/components/ui/deferred-reveal";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DiffViewer, type UnifiedDiffFile } from "@/components/ui/diff-viewer";
import { Drawer } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ConflictConvergeGlyph,
  GitVaultGlyph,
  ICON_STROKE,
  ShieldAuditGlyph,
  SingleSourceGlyph,
  SymlinkMeshGlyph,
} from "@/components/ui/icon";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/ui/metric-card";
import { PathField } from "@/components/ui/path-field";
import { SearchInput } from "@/components/ui/search-input";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { StatusBanner } from "@/components/ui/status-banner";
import { StepList, type StepItem } from "@/components/ui/step-list";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableHead, TableRow, TableTd, TableTh } from "@/components/ui/table";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { Sidebar } from "@/features/shell/Sidebar";
import type { AppPage } from "@/features/shell/page";
import { PlaybookFoundationsSection } from "./PlaybookFoundationsSection.js";
import { PlaybookIconsSection } from "./PlaybookIconsSection.js";
import { PlaybookMotionSection } from "./PlaybookMotionSection.js";
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

const DEMO_TABLE_ROWS = [
  { name: "hyperframes", hash: "e4f82a109c33", clients: 4, status: "warning" as const, statusLabel: "3 变体冲突" },
  { name: "code-video-craft", hash: "91bc44d021ee", clients: 6, status: "success" as const, statusLabel: "纯软链同步" },
  { name: "spec-playbook-delivery", hash: "177ec881b0dc", clients: 0, status: "neutral" as const, statusLabel: "仅入总馆" },
];

export function PlaybookDesignSystemView({
  section,
  onNotice,
}: {
  section: Extract<PlaybookSectionId, "foundations" | "icons" | "atoms" | "motion" | "shell-chrome">;
  onNotice: (text: string) => void;
}): React.JSX.Element {
  const [demoTab, setDemoTab] = useState<"apps" | "content" | "conflicts">("conflicts");
  const [demoSwitch, setDemoSwitch] = useState(true);
  const [demoCheck, setDemoCheck] = useState(true);
  const [demoSelect, setDemoSelect] = useState("private");
  const [demoSearch, setDemoSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shellPage, setShellPage] = useState<AppPage>("skills");
  const [shellCollapsed, setShellCollapsed] = useState(false);
  const [shellHydrating, setShellHydrating] = useState(false);

  if (section === "foundations") {
    return <PlaybookFoundationsSection />;
  }

  if (section === "icons") {
    return <PlaybookIconsSection onNotice={onNotice} />;
  }

  if (section === "motion") {
    return <PlaybookMotionSection />;
  }

  if (section === "atoms") {
    const filteredRows = DEMO_TABLE_ROWS.filter(
      (r) =>
        demoSearch.trim() === "" ||
        r.name.toLowerCase().includes(demoSearch.trim().toLowerCase()) ||
        r.hash.includes(demoSearch.trim().toLowerCase()),
    );

    return (
      <div className="space-y-6">
        {/* 1. 核心 KPI MetricCard */}
        <StaggerItem index={0}>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <MetricCard
              label="唯一真源 Skills"
              value={157}
              delta="全部 SHA-256 已校验"
              deltaTone="success"
              hint="点击查看"
              icon={<SingleSourceGlyph size={18} />}
              iconTone="obsidian"
              progressPct={95}
              onClick={() => onNotice("点击 MetricCard：唯一真源")}
            />
            <MetricCard
              label="受管纯软链接"
              value={286}
              delta="覆盖 9 个客户端"
              deltaTone="slate"
              hint="L1 14ms"
              icon={<SymlinkMeshGlyph size={18} />}
              iconTone="neutral"
              progressPct={80}
              onClick={() => onNotice("点击 MetricCard：受管软链接")}
            />
            <MetricCard
              label="待处理同名冲突"
              value={6}
              delta="异版已全部留底"
              deltaTone="warning"
              hint="需人工裁决"
              icon={<ConflictConvergeGlyph size={18} />}
              iconTone="warning"
              progressPct={24}
              onClick={() => onNotice("点击 MetricCard：待处理冲突")}
            />
          </div>
        </StaggerItem>

        {/* 2. 按钮、表单与搜索 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <StaggerItem index={1}>
            <Card className="h-full space-y-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                  按钮、开关、复选框与分段控制器
                </h3>
                <p className="mt-0.5 text-xs text-ink-mid">
                  主按钮采用黑曜石内高光微高度，同心 10px 圆角；危险操作克制浅底深字。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => onNotice("触发黑曜石主按钮")}>
                  <Plus className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  主按钮
                </Button>
                <Button variant="outline" onClick={() => onNotice("触发次按钮")}>次按钮</Button>
                <Button variant="secondary" onClick={() => onNotice("触发柔衬按钮")}>柔衬按钮</Button>
                <Button variant="ghost">幽灵按钮</Button>
                <Button variant="destructive" onClick={() => setConfirmOpen(true)}>危险确认</Button>
                <Button size="sm" variant="outline" disabled>禁用态</Button>
              </div>
              <div className="flex flex-wrap items-center gap-5 border-t border-line pt-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-strong">
                  <Switch checked={demoSwitch} onCheckedChange={setDemoSwitch} />
                  <span>Git 版本控制（{demoSwitch ? "已开启" : "已关闭"}）</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-strong">
                  <Checkbox checked={demoCheck} onCheckedChange={(v) => setDemoCheck(v === true)} />
                  <span>纳入外部软链接</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <SegmentedTabs value={demoTab} onChange={setDemoTab} items={DEMO_TABS} ariaLabel="示例标签" />
                <CopyButton value="skills-hub reconcile --yes" label="复制命令" copiedLabel="已复制命令" />
              </div>
            </Card>
          </StaggerItem>

          <StaggerItem index={2}>
            <Card className="h-full space-y-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                  输入、SearchInput + Kbd、下拉与多行文本
                </h3>
                <p className="mt-0.5 text-xs text-ink-mid">
                  统一 10px 圆角与发丝微影，聚焦时切换黑曜石克制描边，无刺眼外发光。
                </p>
              </div>
              <SearchInput
                value={demoSearch}
                onValueChange={setDemoSearch}
                shortcut="⌘K"
                placeholder="实时过滤下方表格（例如 hyperframes）…"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pb-input">仓库名称</Label>
                  <Input id="pb-input" defaultValue="my-skills-hub-backup" className="font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pb-select">可见性</Label>
                  <NativeSelect id="pb-select" value={demoSelect} onChange={(e) => setDemoSelect(e.target.value)}>
                    <option value="private">Private（私有推荐）</option>
                    <option value="public">Public（公开）</option>
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pb-textarea">多行备注 / 提交信息（Textarea）</Label>
                <Textarea
                  id="pb-textarea"
                  rows={2}
                  defaultValue="feat(skills): merge hyperframes Windows timing fix via conflict center"
                />
              </div>
            </Card>
          </StaggerItem>
        </div>

        {/* 3. 分组设置行（SettingGroup） + 路径与步骤条 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <StaggerItem index={3}>
            <SettingGroup
              title="分组设置行（SettingGroup + SettingRow）"
              badge={<Badge tone="slate" dot>桌面设置通用</Badge>}
            >
              <SettingRow
                icon={<ShieldAuditGlyph size={16} />}
                iconTone="success"
                title="自动去重备份校验"
                tag={<Badge tone="success" dot>强制开启</Badge>}
                description="接管或迁移真源前，必须生成 SHA-256 校验通过的客户端快照。"
                control={<Badge tone="neutral" className="font-mono">SHA-256</Badge>}
              />
              <SettingRow
                icon={<GitVaultGlyph size={16} />}
                iconTone="slate"
                title="自动本地 Git 提交"
                description="编辑保存、冲突扶正与软删除归档时，写入规范化 commit 记录。"
                control={<Switch checked={demoSwitch} onCheckedChange={setDemoSwitch} aria-label="自动提交" />}
              />
              <SettingRow
                icon={<SlidersHorizontal className="size-4" strokeWidth={ICON_STROKE} />}
                iconTone="surface"
                title="查看高级详情面板"
                description="支持 Dialog 模态弹窗与右侧滑入 Drawer 两种浮层容器。"
                control={
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                      弹窗
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDrawerOpen(true)}>
                      抽屉
                    </Button>
                  </div>
                }
              />
            </SettingGroup>
          </StaggerItem>

          <StaggerItem index={4}>
            <Card className="h-full space-y-4">
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                只读路径（PathField）、步骤条与折叠卡
              </h3>
              <PathField
                label="固定控制与备份中心"
                tag="默认固定"
                hint="占用 18.4 MB"
                path="C:\Users\AIMFl\.skills-hub"
              />
              <div className="rounded-2xl border border-line bg-canvas p-4">
                <StepList items={SAMPLE_STEPS} />
              </div>
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger>
                  <span className="text-sm font-medium">展开查看单色扫掠骨架占位（Skeleton）</span>
                  <Badge tone="neutral">Collapsible</Badge>
                </CollapsibleTrigger>
                <CollapsiblePanel className="mt-2 space-y-2 rounded-xl border border-line bg-canvas p-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-9 w-full" />
                </CollapsiblePanel>
              </Collapsible>
            </Card>
          </StaggerItem>
        </div>

        {/* 4. 全宽商务表格 + 动作菜单（充裕列宽、零换行挤压） */}
        <StaggerItem index={5}>
          <Card className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                  商务表格 + 动作菜单（Table &amp; DropdownMenu）
                </h3>
                <p className="mt-0.5 text-xs text-ink-mid">上方 SearchInput 可实时过滤下表；点击最右侧操作按钮展开菜单。</p>
              </div>
              <Badge tone="slate" dot>{String(filteredRows.length)} 行</Badge>
            </div>
            <Table>
              <TableHead>
                <TableRow className="hover:bg-canvas">
                  <TableTh>Skill 名称</TableTh>
                  <TableTh>内容指纹</TableTh>
                  <TableTh>受管客户端</TableTh>
                  <TableTh>同步状态</TableTh>
                  <TableTh className="w-16 text-right">操作</TableTh>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.name}>
                    <TableTd className="font-mono text-xs font-medium text-ink-strong">{row.name}</TableTd>
                    <TableTd className="font-mono text-xs text-ink-faint">{row.hash}</TableTd>
                    <TableTd className="font-mono text-xs tabular-nums text-ink-mid">
                      {String(row.clients)} 个客户端
                    </TableTd>
                    <TableTd>
                      <Badge tone={row.status} dot>{row.statusLabel}</Badge>
                    </TableTd>
                    <TableTd className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button size="icon" variant="ghost" aria-label={"更多操作 " + row.name}>
                              <MoreHorizontal className="size-4 text-ink-mid" strokeWidth={ICON_STROKE} />
                            </Button>
                          }
                        />
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => onNotice("复制指纹 " + row.hash)}>
                            <Copy className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} />
                            复制内容指纹
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDrawerOpen(true)}>
                            <FolderGit2 className="size-3.5 text-ink-faint" strokeWidth={ICON_STROKE} />
                            查看提交历史
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-700 data-highlighted:bg-red-50 data-highlighted:text-red-800"
                            onClick={() => setConfirmOpen(true)}
                          >
                            <Archive className="size-3.5" strokeWidth={ICON_STROKE} />
                            归档移出活跃区
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableTd>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </StaggerItem>

        {/* 5. 状态横幅（5 态） + Toast 通知发射台 + EmptyState */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <StaggerItem index={6}>
            <Card className="h-full space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                  StatusBanner 五态与 Toast 反馈通道
                </h3>
                <Tooltip label="全局唯一轻量通知通道（Sonner）" side="top">
                  <Badge tone="slate">单一通知通道</Badge>
                </Tooltip>
              </div>
              <StatusBanner
                surface="card"
                tone="info"
                title="信息提示：发现新的已注册客户端 Antigravity"
                description="支持直接投影唯一真源软链接，无需重复复制。"
              />
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
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <Bell className="size-3.5" strokeWidth={ICON_STROKE} />
                  触发 Toast：
                </span>
                <Button size="sm" variant="outline" onClick={() => toast.success("已完成纯软链接收敛（0 数据丢失）")}>
                  成功通知
                </Button>
                <Button size="sm" variant="outline" onClick={() => toast.warning("检测到较新版本内容更短，请复核")}>
                  警告通知
                </Button>
                <Button size="sm" variant="outline" onClick={() => toast.error("远端仓库存在分叉，已拒绝强制推送")}>
                  错误通知
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast("已归档 hyperframes 至 archive/", {
                      action: { label: "立即恢复", onClick: () => toast.success("已从归档区恢复") },
                    })
                  }
                >
                  带撤销动作
                </Button>
              </div>
            </Card>
          </StaggerItem>

          <StaggerItem index={7}>
            <Card className="flex h-full flex-col justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                  商务空状态（EmptyState）
                </h3>
                <p className="mt-0.5 text-xs text-ink-mid">
                  空状态必配建筑感图标锚点、清晰解释与明确主/次动作按钮。
                </p>
              </div>
              <EmptyState
                icon={<Sparkles className="size-5" strokeWidth={ICON_STROKE} />}
                iconTone="slate"
                title="还没有已启用的客户端 Skill"
                description="所有 Skill 实体已安全保存在唯一真源目录。你可以一键接管本机已有目录，或直接创建新的标准化 Skill。"
                action={
                  <Button size="sm" onClick={() => onNotice("执行一键接管")}>
                    一键接管本机 Skills
                  </Button>
                }
                secondaryAction={
                  <Button size="sm" variant="outline" onClick={() => onNotice("创建新 Skill")}>
                    新建 Skill
                  </Button>
                }
              />
            </Card>
          </StaggerItem>
        </div>

        {/* 6. 全宽逐文件差异对比（DiffViewer） */}
        <StaggerItem index={8}>
          <Card className="space-y-3">
            <h3 className="text-base font-semibold tracking-tight text-ink-strong">
              确定性逐文件差异对比（DiffViewer）
            </h3>
            <DiffViewer files={SAMPLE_DIFF} />
          </Card>
        </StaggerItem>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogTitle>商务模态弹窗（Dialog）</DialogTitle>
            <DialogDescription>
              16px 同心圆角 + 克制微高度浮层 + 无毛玻璃暗幕，配合 --ease-spring 弹性缩放入场。
            </DialogDescription>
            <div className="mt-4 rounded-xl border border-line bg-canvas p-3.5 text-xs leading-relaxed text-ink-mid">
              所有焦点陷阱与 Esc 关闭由 Base UI Dialog 原生托管，符合无障碍键盘导航规范。
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={() => { setDialogOpen(false); onNotice("已确认模态弹窗"); }}>确认</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title="统一右侧抽屉（Drawer）"
          description="无毛玻璃、商务微高度边栏阴影、--ease-smooth 滑入，复用于单 Skill Git 历史抽屉。"
          footer={<Button variant="outline" onClick={() => setDrawerOpen(false)}>关闭</Button>}
        >
          <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)]">
            <StepList items={SAMPLE_STEPS} />
          </div>
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

  // shell-chrome
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-ink-strong">
            真实左侧栏（Sidebar）与主区晚加载骨架联动预览
          </h3>
          <p className="mt-1 text-sm text-ink-mid">
            直接复用
            <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink-strong">@/features/shell/Sidebar</code>
            ：48px 图标列 + 文案淡出，导航严格保持纵向
            <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink-strong">flex-col</code>。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShellHydrating(true);
              window.setTimeout(() => setShellHydrating(false), 750);
            }}
          >
            <RefreshCw className="size-3.5 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
            模拟主区晚加载
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShellCollapsed((c) => !c)}>
            {shellCollapsed ? "展开侧栏" : "收起侧栏"}
          </Button>
        </div>
      </div>
      <div className="flex h-[360px] overflow-hidden rounded-2xl border border-line bg-canvas shadow-[var(--shadow-card)]">
        <div
          className="sidebar-preview-rail border-r border-line bg-white"
          style={{ width: shellCollapsed ? 48 : 224 }}
        >
          <Sidebar
            chats={{ current: "demo", threads: [{ id: "demo", title: "技能整理" }] }}
            onChat={() => onNotice("打开示例对话")}
            page={shellPage}
            collapsed={shellCollapsed}
            settingsOpen={false}
            onPage={(next) => {
              setShellPage(next);
              setShellHydrating(true);
              window.setTimeout(() => setShellHydrating(false), 320);
            }}
            onSettings={() => onNotice("左下角设置入口 → 打开 SettingsDialog")}
            onToggleCollapsed={() => setShellCollapsed((c) => !c)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas/70">
          <DeferredReveal loading={shellHydrating} skeleton={<PageSkeleton />}>
            <div key={shellPage} className="motion-enter flex h-full flex-col justify-between p-6">
              <div className="space-y-3">
                <Badge tone="slate" dot>
                  当前板块：{shellPage}
                </Badge>
                <p className="text-xl font-semibold tracking-tight text-ink-strong">
                  总览 / 统计 / Skills 管理 / Agent
                </p>
                <p className="max-w-lg text-sm leading-relaxed text-ink-mid">
                  一级侧栏保持克制四板块 + 左下角设置入口，切页走 <code className="font-mono text-xs text-ink-strong">key + motion-enter</code>，异步数据走 <code className="font-mono text-xs text-ink-strong">DeferredReveal</code> 骨架平滑解码。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-4">
                <MetricCard label="Skills" value={157} icon={<SingleSourceGlyph size={16} />} iconTone="obsidian" />
                <MetricCard label="软链接" value={286} icon={<SymlinkMeshGlyph size={16} />} iconTone="neutral" />
                <MetricCard label="冲突" value={6} icon={<ConflictConvergeGlyph size={16} />} iconTone="warning" />
              </div>
            </div>
          </DeferredReveal>
        </div>
      </div>
    </Card>
  );
}
