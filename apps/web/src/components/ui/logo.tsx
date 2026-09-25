import { cn } from "@/lib/utils";

const SPOKES = Array.from({ length: 6 }, (_, k) => {
  const a = ((-90 + k * 60) * Math.PI) / 180;
  return { x: 32 + Math.cos(a) * 22, y: 32 + Math.sin(a) * 22 };
});

/** Hub 标志(ui-design-v2 §8):中心库存 + 六条链接到各 Agent。墨色轮辐,信号色核心。 */
export function Logo({ className, title = "Skills Hub" }: { className?: string; title?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" fill="none" role="img" aria-label={title} className={cn("size-6 shrink-0", className)}>
      <g stroke="var(--color-ink-strong)" strokeWidth="3.5" strokeLinecap="round">
        {SPOKES.map((p) => (
          <line key={`${p.x}-${p.y}`} x1="32" y1="32" x2={p.x} y2={p.y} />
        ))}
      </g>
      <g fill="var(--color-ink-strong)">
        {SPOKES.map((p) => (
          <circle key={`n-${p.x}-${p.y}`} cx={p.x} cy={p.y} r="5" />
        ))}
      </g>
      <circle cx="32" cy="32" r="9.5" fill="var(--color-volt-fill)" stroke="var(--color-ink-strong)" strokeWidth="3.5" />
    </svg>
  );
}
