import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StaggerItem } from "@/components/ui/deferred-reveal";
import { cn } from "@/lib/utils";

const SWATCHES = [
  { name: "bg-white", token: "#ffffff", desc: "卡片与主体平面", cls: "bg-white border border-line" },
  { name: "bg-canvas", token: "#f6f6f7", desc: "雪花石膏画布底", cls: "bg-canvas border border-line" },
  { name: "bg-surface", token: "#f1f2f5", desc: "内嵌槽与次级面", cls: "bg-surface border border-line" },
  { name: "accent-soft", token: "#eef2f7", desc: "商务石板柔衬", cls: "bg-accent-soft border border-slate-200" },
  { name: "border-line", token: "#e5e7ec", desc: "发丝分隔边框", cls: "bg-line" },
  { name: "ink-faint", token: "#8a919f", desc: "辅助标注与时间", cls: "bg-ink-faint" },
  { name: "ink-mid", token: "#4f5664", desc: "次级正文与说明", cls: "bg-ink-mid" },
  { name: "ink-strong", token: "#111318", desc: "黑曜石主墨色", cls: "bg-ink-strong" },
] as const;

const RADII = [
  { label: "外卡 / 弹窗", token: "rounded-2xl", px: "16px", cls: "rounded-2xl" },
  { label: "内层 / 横幅", token: "rounded-xl", px: "12px", cls: "rounded-xl" },
  { label: "按钮 / 输入", token: "rounded-[10px]", px: "10px", cls: "rounded-[10px]" },
  { label: "分段滑块", token: "rounded-[7px]", px: "7px", cls: "rounded-[7px]" },
  { label: "胶囊徽标", token: "rounded-full", px: "9999px", cls: "rounded-full" },
] as const;

const ELEVATIONS = [
  {
    name: "--shadow-card",
    usage: "白卡片置于雪花石膏画布上",
    cls: "shadow-[var(--shadow-card)]",
  },
  {
    name: "--shadow-thumb",
    usage: "分段控制器 / 导航选中项",
    cls: "shadow-[var(--shadow-thumb)]",
  },
  {
    name: "--shadow-lift",
    usage: "KPI 卡片与可交互卡片悬停轻抬",
    cls: "shadow-[var(--shadow-lift)]",
  },
  {
    name: "--shadow-overlay",
    usage: "Dialog 弹窗 / Drawer 抽屉 / 菜单浮层",
    cls: "shadow-[var(--shadow-overlay)]",
  },
] as const;

/** Foundations 板块：商务极简中性灰阶、同心圆角几何、克制微高度与排版层级。 */
export function PlaybookFoundationsSection(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <StaggerItem index={0}>
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                温润黑曜石与雪花石膏中性色板
              </h3>
              <p className="mt-1 text-sm text-ink-mid">
                用 <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-strong">bg-canvas (#f6f6f7)</code> 托起纯白卡片，消除「白纸糊灰线」的扁平廉价感；无渐变、无荧光、无毛玻璃。
              </p>
            </div>
            <Badge tone="slate" dot>
              v0.3 Executive Monochrome
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {SWATCHES.map((s) => (
              <div
                key={s.name}
                className="rounded-xl border border-line/80 bg-canvas/55 p-2.5"
              >
                <div className={cn("h-12 rounded-[9px]", s.cls)} />
                <div className="mt-2.5 flex items-baseline justify-between gap-1">
                  <p className="font-mono text-xs font-medium text-ink-strong">{s.name}</p>
                  <p className="font-mono text-[11px] text-ink-faint">{s.token}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-mid">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="mr-1 text-xs font-medium text-ink-faint">五态语义胶囊（含细描边与状态点）：</span>
            <Badge tone="neutral" dot>中性态 Neutral</Badge>
            <Badge tone="slate" dot>商务石板 Slate</Badge>
            <Badge tone="success" dot>翡翠成功 Success</Badge>
            <Badge tone="warning" dot>香槟预警 Warning</Badge>
            <Badge tone="danger" dot>朱砂警示 Danger</Badge>
          </div>
        </Card>
      </StaggerItem>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StaggerItem index={1}>
          <Card className="h-full space-y-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                同心圆角几何（Concentric Radii）
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                外圆角减去内边距等于内圆角（16px → 12px → 10px → 7px），视觉严丝合缝，告别生硬直楞或圆角打架。
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-canvas p-3">
              <div className="rounded-xl border border-line bg-white p-3 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-surface p-1.5">
                  <span className="rounded-[7px] bg-white px-3 py-1 text-xs font-medium text-ink-strong shadow-[var(--shadow-thumb)]">
                    7px 内嵌滑块
                  </span>
                  <span className="pr-2 font-mono text-[11px] text-ink-faint">16 → 12 → 10 → 7px</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {RADII.map((r) => (
                <div key={r.token} className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas/50 p-2.5">
                  <div className={cn("size-7 shrink-0 border border-ink-strong/40 bg-white", r.cls)} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink-strong">{r.label}</p>
                    <p className="font-mono text-[11px] text-ink-faint">{r.px}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem index={2}>
          <Card className="h-full space-y-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight text-ink-strong">
                克制微高度层级（Hairline Elevation）
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                用极浅发丝冷炭影建立实体层级，禁止粗重 drop-shadow 与彩色光晕。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ELEVATIONS.map((e) => (
                <div
                  key={e.name}
                  className={cn(
                    "rounded-2xl border border-line bg-white p-4",
                    e.cls,
                  )}
                >
                  <p className="font-mono text-xs font-semibold text-ink-strong">{e.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-mid">{e.usage}</p>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>
      </div>

      <StaggerItem index={3}>
        <Card className="space-y-3">
          <h3 className="text-base font-semibold tracking-tight text-ink-strong">
            6 档排版字号与字重（上限 semibold，数字强制 tabular-nums）
          </h3>
          <div className="divide-y divide-line">
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="text-2xl font-semibold tracking-tight text-ink-strong">页面标题 24px Semibold</span>
              <code className="font-mono text-xs text-ink-faint">text-2xl font-semibold tracking-tight</code>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="text-base font-semibold tracking-tight text-ink-strong">区块标题 16px Semibold</span>
              <code className="font-mono text-xs text-ink-faint">text-base font-semibold tracking-tight</code>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="text-sm font-medium text-ink-strong">条目标题 14px Medium</span>
              <code className="font-mono text-xs text-ink-faint">text-sm font-medium</code>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="text-sm text-ink-mid">正文说明 14px Regular（行高 1.5）</span>
              <code className="font-mono text-xs text-ink-faint">text-sm leading-relaxed text-ink-mid</code>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="text-xs text-ink-faint">次要标签与时间戳 12px · 2026-11-20 22:45</span>
              <code className="font-mono text-xs text-ink-faint">text-xs tabular-nums text-ink-faint</code>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span className="font-mono text-xs text-ink-strong">C:\Users\AIMFl\.skills-hub\skills</span>
              <code className="font-mono text-xs text-ink-faint">font-mono text-xs</code>
            </div>
          </div>
        </Card>
      </StaggerItem>
    </div>
  );
}
