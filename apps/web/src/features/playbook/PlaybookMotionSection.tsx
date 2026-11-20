import { Check, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DeferredReveal,
  LazyViewportSection,
  StaggerItem,
} from "@/components/ui/deferred-reveal";
import {
  ConflictConvergeGlyph,
  GitVaultGlyph,
  ICON_STROKE,
  IconBadge,
  ShieldAuditGlyph,
  SingleSourceGlyph,
  SymlinkMeshGlyph,
} from "@/components/ui/icon";
import { MetricCard } from "@/components/ui/metric-card";
import { SettingGroup, SettingRow } from "@/components/ui/setting-row";
import { SkeletonMetricGrid, SkeletonRowList } from "@/components/ui/skeleton";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const SPEED_TABS: SegmentedTabItem<"1x" | "slow">[] = [
  { id: "1x", label: "1× 标准速度" },
  { id: "slow", label: "0.35× 慢放审校" },
];

const STAGGER_CARDS = [
  { title: "单一真源", sub: "157 Skills", Icon: SingleSourceGlyph },
  { title: "纯软链接网", sub: "286 Links", Icon: SymlinkMeshGlyph },
  { title: "冲突池保护", sub: "6 Variants", Icon: ConflictConvergeGlyph },
  { title: "Git 云端金库", sub: "Synced", Icon: GitVaultGlyph },
  { title: "自愈巡检", sub: "14ms L1", Icon: ShieldAuditGlyph },
  { title: "零真删除", sub: "Archive Only", Icon: SingleSourceGlyph },
] as const;

/** 动效与晚加载实验室：覆盖 DeferredReveal / StaggerItem / LazyViewportSection 与核心微交互。 */
export function PlaybookMotionSection(): React.JSX.Element {
  const [speed, setSpeed] = useState<"1x" | "slow">("1x");
  const [deferredLoading, setDeferredLoading] = useState(false);
  const [staggerKey, setStaggerKey] = useState(0);
  const [viewportKey, setViewportKey] = useState(0);
  const [enterKey, setEnterKey] = useState(0);
  const [chevronOpen, setChevronOpen] = useState(false);
  const [barKey, setBarKey] = useState(0);

  const motionScopeStyle = {
    "--motion-scale": speed === "slow" ? "2.8" : "1",
  } as CSSProperties;

  const replayDeferred = (): void => {
    setDeferredLoading(true);
    const delay = speed === "slow" ? 1300 : 680;
    window.setTimeout(() => setDeferredLoading(false), delay);
  };

  return (
    <div style={motionScopeStyle} className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-ink-strong">
              动效节奏控制台与晚加载体系
            </h3>
            <Badge tone="slate" dot>
              prefers-reduced-motion 友好
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-mid">
            切换至「0.35× 慢放审校」可逐帧检查弹簧曲线、骨架到内容的解码落定与交错级联节奏；静置零定时器轮询。
          </p>
        </div>
        <SegmentedTabs
          size="sm"
          ariaLabel="动效播放倍速"
          value={speed}
          items={SPEED_TABS}
          onChange={setSpeed}
        />
      </Card>

      {/* 晚加载 1: DeferredReveal 骨架 → 真实内容平滑解码 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-ink-strong">
                1. 晚加载解码过渡（DeferredReveal · Skeleton → Content）
              </h4>
              <Badge tone={deferredLoading ? "warning" : "success"} dot>
                {deferredLoading ? "骨架水合中…" : "已平滑解码"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-mid">
              异步数据返回前使用同高骨架（单色微光扫掠），就绪后通过 <code className="font-mono text-ink-strong">motion-reveal</code> 轻柔落定，绝不生硬闪现或跳动布局。
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={deferredLoading} onClick={replayDeferred}>
            <RefreshCw
              className={cn("size-3.5 text-ink-mid", deferredLoading && "motion-safe:animate-spin")}
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            {deferredLoading ? "加载骨架中…" : "模拟晚加载（680ms）"}
          </Button>
        </div>

        <DeferredReveal
          loading={deferredLoading}
          skeleton={<SkeletonMetricGrid count={3} />}
        >
          <div className="grid gap-3.5 sm:grid-cols-3">
            <MetricCard
              label="唯一真源 Skills"
              value={157}
              delta="100% 校验一致"
              deltaTone="success"
              hint="SHA-256"
              icon={<SingleSourceGlyph size={18} />}
              iconTone="obsidian"
              progressPct={94}
              interactive
            />
            <MetricCard
              label="受管纯软链接"
              value={286}
              delta="跨 9 个客户端"
              deltaTone="slate"
              hint="L1 14ms"
              icon={<SymlinkMeshGlyph size={18} />}
              iconTone="neutral"
              progressPct={82}
              interactive
            />
            <MetricCard
              label="待裁决同名冲突"
              value={6}
              delta="异版已安全入池"
              deltaTone="warning"
              hint="零丢失"
              icon={<ConflictConvergeGlyph size={18} />}
              iconTone="warning"
              progressPct={18}
              interactive
            />
          </div>
        </DeferredReveal>
      </Card>

      {/* 晚加载 2: StaggerItem 交错级联 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-ink-strong">
              2. 交错级联揭示（StaggerItem · 48ms 阶梯入场）
            </h4>
            <p className="mt-0.5 text-xs text-ink-mid">
              用于多卡网格、设置项与提交时间线，上限封顶 8 项避免长列表拖沓。
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setStaggerKey((k) => k + 1)}>
            重放交错级联
          </Button>
        </div>

        <div key={staggerKey} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAGGER_CARDS.map((card, i) => {
            const Icon = card.Icon;
            return (
              <StaggerItem key={card.title} index={i}>
                <div className="motion-card-lift flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-3.5 shadow-[var(--shadow-card)]">
                  <IconBadge size="sm" tone={i === 0 ? "obsidian" : "surface"}>
                    <Icon size={16} />
                  </IconBadge>
                  <div>
                    <p className="text-xs font-medium text-ink-strong">{card.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{card.sub}</p>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </div>
      </Card>

      {/* 晚加载 3: LazyViewportSection 视口滚动懒揭示 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-ink-strong">
              3. 折下视口懒加载（LazyViewportSection · IntersectionObserver）
            </h4>
            <p className="mt-0.5 text-xs text-ink-mid">
              未滚入视口前保持骨架占位，滚入时触发解码揭示并立即卸载观察器（静置期 0 CPU 消耗）。向下滚动内部视口或点击重置体验：
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setViewportKey((k) => k + 1)}>
            重置视口懒加载
          </Button>
        </div>

        <div className="h-52 overflow-y-auto rounded-2xl border border-line bg-canvas p-4">
          <div className="mb-4 rounded-xl border border-dashed border-line-strong/70 bg-white px-4 py-6 text-center text-xs text-ink-mid">
            ↓ 向下滚动此容器，触发下方区块的视口懒加载与 420ms 晚加载解码 ↓
          </div>
          <LazyViewportSection
            replayKey={viewportKey}
            simulatedDelayMs={speed === "slow" ? 800 : 420}
            skeleton={<SkeletonRowList rows={2} />}
          >
            <SettingGroup title="已由视口观察器晚加载挂载的真实区块">
              <SettingRow
                icon={<ShieldAuditGlyph size={16} />}
                iconTone="success"
                title="观察器已自动解绑（Zero Idle CPU）"
                tag={<Badge tone="success" dot>smoke-panel 绿灯</Badge>}
                description="进入视口一次即完成挂载与 disconnect()，不会在后台占用任何轮询或帧回调。"
              />
              <SettingRow
                icon={<GitVaultGlyph size={16} />}
                iconTone="slate"
                title="可复用于长页面折下统计模块与审计表"
                description="配合 SkeletonRowList 保持与真实行等高，彻底消除滚动跳动（CLS = 0）。"
              />
            </SettingGroup>
          </LazyViewportSection>
        </div>
      </Card>

      {/* 基础交互动效 */}
      <Card className="space-y-4">
        <h4 className="text-sm font-semibold text-ink-strong">4. 核心微交互原语（严禁业务手写 duration/ease）</h4>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2.5 rounded-2xl border border-line bg-canvas/55 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-medium text-ink-strong">motion-enter (page-in)</span>
              <Button size="sm" variant="outline" onClick={() => setEnterKey((k) => k + 1)}>
                重放切页入场
              </Button>
            </div>
            <div
              key={enterKey}
              className="motion-enter flex items-center gap-2 rounded-xl border border-line bg-white p-3.5 text-sm text-ink-strong shadow-[var(--shadow-card)]"
            >
              <Sparkles className="size-4 shrink-0 text-ink-mid" strokeWidth={ICON_STROKE} aria-hidden />
              <span>opacity 0→1 + translateY(5px→0)，520ms --ease-smooth</span>
            </div>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-line bg-canvas/55 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-medium text-ink-strong">motion-chevron + motion-row</span>
              <Badge tone="slate">spring 300ms</Badge>
            </div>
            <button
              type="button"
              onClick={() => setChevronOpen((v) => !v)}
              className="motion-row flex w-full items-center justify-between rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink-strong shadow-[var(--shadow-control)] hover:border-line-strong"
            >
              <span className="flex items-center gap-2">
                <ChevronRight
                  className={cn("motion-chevron size-4 text-ink-mid", chevronOpen && "rotate-90 text-ink-strong")}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
                点击体验按压微缩 + 弹簧 90° 旋转
              </span>
              <Check
                className={cn("size-4 text-emerald-700 transition-opacity", !chevronOpen && "opacity-0")}
                strokeWidth={2}
                aria-hidden
              />
            </button>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-line bg-canvas/55 p-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-medium text-ink-strong">animate-bar-in (scaleX 500ms)</span>
              <Button size="sm" variant="outline" onClick={() => setBarKey((k) => k + 1)}>
                重放微进度条
              </Button>
            </div>
            <div key={barKey} className="space-y-2.5 pt-1">
              {[
                { label: "Codex CLI 覆盖率", pct: 92 },
                { label: "Claude Code 覆盖率", pct: 76 },
                { label: "Antigravity 覆盖率", pct: 58 },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-mid">{row.label}</span>
                    <span className="font-mono font-medium tabular-nums text-ink-strong">{row.pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                    <div className="animate-bar-in h-full rounded-full bg-ink-strong" style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
