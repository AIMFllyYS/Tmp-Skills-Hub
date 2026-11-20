import {
  Check,
  FolderGit2,
  GitBranch,
  KeyRound,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StaggerItem } from "@/components/ui/deferred-reveal";
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
  ShieldAuditGlyph,
  SingleSourceGlyph,
  SymlinkMeshGlyph,
  type GlyphProps,
} from "@/components/ui/icon";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";

interface CustomGlyphEntry {
  name: string;
  label: string;
  usage: string;
  Component: ComponentType<GlyphProps>;
}

const CUSTOM_GLYPHS: readonly CustomGlyphEntry[] = [
  { name: "HubBrandMark", label: "品牌几何徽标", usage: "应用主标志 / 侧栏抬头", Component: HubBrandMark },
  { name: "SingleSourceGlyph", label: "单一真源核", usage: "T1 双路径引导与迁移", Component: SingleSourceGlyph },
  { name: "SymlinkMeshGlyph", label: "纯软链投影网", usage: "T2 巡检与一键接管", Component: SymlinkMeshGlyph },
  { name: "ConflictConvergeGlyph", label: "多版本收敛标", usage: "T3 同名冲突裁决中心", Component: ConflictConvergeGlyph },
  { name: "GitVaultGlyph", label: "Git 云端金库", usage: "T5 版本控制与云备份", Component: GitVaultGlyph },
  { name: "ShieldAuditGlyph", label: "安全自愈护盾", usage: "健康自检与安全说明", Component: ShieldAuditGlyph },
  { name: "LayersFrameGlyph", label: "设计地基叠页", usage: "色彩、圆角与排版板块", Component: LayersFrameGlyph },
  { name: "IconCraftGlyph", label: "图标标尺几何", usage: "图标与线宽规范板块", Component: IconCraftGlyph },
  { name: "ComponentsGridGlyph", label: "瑞士组件网格", usage: "原子组件目录板块", Component: ComponentsGridGlyph },
  { name: "MotionCurveGlyph", label: "贝塞尔动效曲线", usage: "动效与晚加载实验室", Component: MotionCurveGlyph },
  { name: "ShellWindowGlyph", label: "双栏桌面壳标", usage: "壳层与侧栏预览板块", Component: ShellWindowGlyph },
];

const SIZE_TABS: SegmentedTabItem<"16" | "20" | "24">[] = [
  { id: "16", label: "16px" },
  { id: "20", label: "20px" },
  { id: "24", label: "24px" },
];

const BADGE_TONES = [
  { tone: "obsidian", label: "Obsidian", desc: "主入口 / 关键模块" },
  { tone: "neutral", label: "Neutral", desc: "卡片默认图标框" },
  { tone: "surface", label: "Surface", desc: "设置行次级图标" },
  { tone: "slate", label: "Slate", desc: "商务强调与信息态" },
  { tone: "success", label: "Success", desc: "健康 / 已同步" },
  { tone: "warning", label: "Warning", desc: "冲突 / 待复核" },
  { tone: "danger", label: "Danger", desc: "密钥拦截 / 错误" },
] as const;

const LUCIDE_COMPARE = [
  { name: "GitBranch", Icon: GitBranch },
  { name: "ShieldCheck", Icon: ShieldCheck },
  { name: "FolderGit2", Icon: FolderGit2 },
  { name: "KeyRound", Icon: KeyRound },
  { name: "RefreshCw", Icon: RefreshCw },
  { name: "Search", Icon: Search },
  { name: "Layers", Icon: Layers },
  { name: "Sparkles", Icon: Sparkles },
] as const;

/** 图标与建筑感徽标板块：自绘 11 枚几何 SVG 领域图标 + IconBadge 矩阵 + 1.6 精雕线宽对比。 */
export function PlaybookIconsSection({
  onNotice,
}: {
  onNotice: (text: string) => void;
}): React.JSX.Element {
  const [glyphSize, setGlyphSize] = useState<"16" | "20" | "24">("20");
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const numericSize = Number(glyphSize);

  const copyGlyphSnippet = (name: string): void => {
    const snippet = `<${name} size={${glyphSize}} />`;
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(snippet).then(
        () => {
          setCopiedName(name);
          onNotice("已复制图标调用：" + snippet);
          window.setTimeout(() => setCopiedName((cur) => (cur === name ? null : cur)), 1400);
        },
        () => onNotice("复制失败"),
      );
    }
  };

  return (
    <div className="space-y-6">
      <StaggerItem index={0}>
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                1. 自绘几何领域图标（Duotone Architectural Glyphs）
              </h3>
              <p className="mt-1 text-sm text-ink-mid">
                基于 24×24 像素网格手绘，
                <code className="mx-0.5 rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink-strong">1.5px</code>
                锐利描边叠加
                <code className="mx-0.5 rounded bg-surface px-1 py-0.5 font-mono text-xs text-ink-strong">10%–14%</code>
                极轻建筑面填充，点击任意图标卡片即可复制 JSX。
              </p>
            </div>
            <SegmentedTabs
              size="sm"
              ariaLabel="图标预览尺寸"
              value={glyphSize}
              items={SIZE_TABS}
              onChange={setGlyphSize}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CUSTOM_GLYPHS.map((item) => {
              const Icon = item.Component;
              const copied = copiedName === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => copyGlyphSnippet(item.name)}
                  className="motion-card-lift flex items-center gap-3.5 rounded-2xl border border-line bg-white p-3.5 text-left shadow-[var(--shadow-card)] outline-none focus-visible:ring-1 focus-visible:ring-line-strong"
                >
                  <IconBadge size="lg" tone="neutral">
                    <Icon size={numericSize} />
                  </IconBadge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink-strong">{item.label}</p>
                      {copied && (
                        <Badge tone="success" className="shrink-0 px-1.5 py-0 text-[11px]">
                          <Check className="size-3" strokeWidth={2} />
                          已复制
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">{item.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-mid">{item.usage}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </StaggerItem>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StaggerItem index={1}>
          <Card className="h-full space-y-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                2. IconBadge 建筑感容器矩阵（7 态 × 4 尺寸）
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                给裸图标加上同心圆角底座与发丝描边，瞬间建立专业桌面应用的商务秩序感。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {BADGE_TONES.map((entry) => (
                <div
                  key={entry.tone}
                  className="flex items-center gap-3 rounded-xl border border-line bg-canvas/60 px-3 py-2.5"
                >
                  <IconBadge size="md" tone={entry.tone}>
                    <HubBrandMark size={18} />
                  </IconBadge>
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium text-ink-strong">{entry.label}</p>
                    <p className="truncate text-xs text-ink-mid">{entry.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
              {(["xs", "sm", "md", "lg"] as const).map((sz) => (
                <div key={sz} className="flex flex-col items-center gap-1.5">
                  <IconBadge size={sz} tone="obsidian">
                    <SingleSourceGlyph size={sz === "xs" ? 13 : sz === "sm" ? 15 : sz === "md" ? 18 : 20} />
                  </IconBadge>
                  <span className="font-mono text-[11px] text-ink-faint">{sz}</span>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem index={2}>
          <Card className="h-full space-y-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                3. Lucide 精雕线宽规范（1.6px vs 默认 2.0px）
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                全仓通用操作图标统一传入 <code className="rounded bg-surface px-1 py-0.5 font-mono text-ink-strong">strokeWidth=&#123;ICON_STROKE&#125;</code>（1.6），消除默认 2.0 粗线的笨重后台模板味。
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-canvas/60 p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <Badge tone="neutral">旧默认 · 裸排 strokeWidth=2.0</Badge>
                  <span className="text-xs text-ink-faint">笔画偏粗、无锚点</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-ink-mid">
                  {LUCIDE_COMPARE.map(({ name, Icon }) => (
                    <Icon key={name} className="size-4" strokeWidth={2} aria-hidden />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-ink-strong/20 bg-white p-3.5 shadow-[var(--shadow-card)]">
                <div className="mb-2.5 flex items-center justify-between">
                  <Badge tone="success" dot>
                    新规范 · IconBadge + ICON_STROKE (1.6)
                  </Badge>
                  <span className="text-xs text-ink-mid">锐利克制、层次清晰</span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {LUCIDE_COMPARE.map(({ name, Icon }) => (
                    <IconBadge key={name} size="sm" tone="neutral">
                      <Icon className="size-4 text-ink-strong" strokeWidth={ICON_STROKE} aria-hidden />
                    </IconBadge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </StaggerItem>
      </div>
    </div>
  );
}
