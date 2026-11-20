import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DeferredRevealProps {
  /** 是否处于异步加载态；从 true 切换为 false 时以 motion-reveal 平滑落定，避免生硬闪现。 */
  loading: boolean;
  /** 加载期占位骨架 */
  skeleton: ReactNode;
  /** 真实水合内容 */
  children: ReactNode;
  className?: string | undefined;
  testId?: string | undefined;
}

/** 统一晚加载（Deferred Hydration）容器：骨架态与真实内容之间平滑解码过渡，零布局跳动。 */
export function DeferredReveal({
  loading,
  skeleton,
  children,
  className,
  testId,
}: DeferredRevealProps): React.JSX.Element {
  return (
    <div className={cn("min-w-0", className)} data-testid={testId} aria-busy={loading}>
      {loading ? (
        <div key="skeleton" className="min-w-0">
          {skeleton}
        </div>
      ) : (
        <div key="content" className="motion-reveal min-w-0">
          {children}
        </div>
      )}
    </div>
  );
}

export interface StaggerItemProps {
  /** 列表/卡片序号（0..8），自动按 48ms 递进延迟入场，超出 8 项封顶以防等待过长。 */
  index: number;
  children: ReactNode;
  className?: string;
}

/** 交错级联入场包装器：用于 KPI 网格、设置行与卡片列表的精密有序揭示。 */
export function StaggerItem({ index, children, className }: StaggerItemProps): React.JSX.Element {
  const style = { "--stagger-i": Math.max(0, Math.min(index, 8)) } as CSSProperties;
  return (
    <div style={style} className={cn("motion-stagger min-w-0", className)}>
      {children}
    </div>
  );
}

export interface LazyViewportSectionProps {
  /** 尚未滚入视口前显示的轻量骨架 */
  skeleton: ReactNode;
  /** 进入视口后挂载并揭示的真实内容 */
  children: ReactNode;
  /** 视口提前量，默认 "0px 0px -36px 0px" */
  rootMargin?: string;
  /** 是否允许在 Playbook 中强制重播；改变该 key 可重置回未揭示态 */
  replayKey?: number;
  /** 可选：模拟额外异步晚加载耗时（毫秒，仅实验室演示用，业务默认 0） */
  simulatedDelayMs?: number;
  className?: string;
}

/**
 * 视口懒加载揭示容器：利用 IntersectionObserver 在滚入视口时才挂载真实节点，
 * 触发后立即 disconnect 观察器，确保静置期零 CPU 占用（完全满足 smoke-panel 性能门禁）。
 */
export function LazyViewportSection({
  skeleton,
  children,
  rootMargin = "0px 0px -24px 0px",
  replayKey = 0,
  simulatedDelayMs = 0,
  className,
}: LazyViewportSectionProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [revealedForKey, setRevealedForKey] = useState<number | null>(null);
  const revealed = revealedForKey === replayKey;

  useEffect(() => {
    const el = hostRef.current;
    if (el === null) return;

    let timer: number | null = null;
    const trigger = (): void => {
      if (simulatedDelayMs > 0) {
        timer = window.setTimeout(() => setRevealedForKey(replayKey), simulatedDelayMs);
      } else {
        setRevealedForKey(replayKey);
      }
    };

    if (typeof IntersectionObserver === "undefined") {
      timer = window.setTimeout(() => setRevealedForKey(replayKey), Math.max(0, simulatedDelayMs));
      return () => {
        if (timer !== null) window.clearTimeout(timer);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting);
        if (!hit) return;
        observer.disconnect();
        trigger();
      },
      { rootMargin, threshold: 0.08 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [replayKey, rootMargin, simulatedDelayMs]);

  return (
    <div ref={hostRef} className={cn("min-w-0", className)} aria-busy={!revealed}>
      {revealed ? (
        <div key={"revealed-" + String(replayKey)} className="motion-reveal min-w-0">
          {children}
        </div>
      ) : (
        <div key={"pending-" + String(replayKey)} className="min-w-0">
          {skeleton}
        </div>
      )}
    </div>
  );
}
