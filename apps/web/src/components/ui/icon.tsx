import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/** 全仓精雕 Lucide 图标默认线宽（比默认 2px 更锐利、具建筑商务感）。 */
export const ICON_STROKE = 1.6;

export interface GlyphProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function glyphBase(size: number, className?: string): {
  width: number;
  height: number;
  viewBox: string;
  fill: "none";
  className: string;
  "aria-hidden": true;
} {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    className: cn("shrink-0", className),
    "aria-hidden": true,
  };
}

/** 1. Skills Hub 专属几何徽标：双层错位精密菱形矩阵，象征单一真源向外精准投影。 */
export function HubBrandMark({ size = 20, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <rect
        x="3.25"
        y="3.25"
        width="17.5"
        height="17.5"
        rx="4.75"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 6.75L16.75 9.5V14.5L12 17.25L7.25 14.5V9.5L12 6.75Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
    </svg>
  );
}

/** 2. 色彩与设计地基：建筑双层叠页几何图标。 */
export function LayersFrameGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <path
        d="M12 4.25L19.5 8.25L12 12.25L4.5 8.25L12 4.25Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5 12.4L12 16.15L19 12.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.25L12 20L19 16.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.65"
      />
    </svg>
  );
}

/** 3. 图标系统专属标：精密十字标尺与几何轮廓。 */
export function IconCraftGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.45"
        strokeDasharray="2.5 2.5"
      />
      <circle
        cx="12"
        cy="12"
        r="5"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 7V17M7 12H17"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** 4. 原子组件库：非对称瑞士网格四模块标。 */
export function ComponentsGridGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <rect
        x="3.75"
        y="3.75"
        width="7.25"
        height="9.25"
        rx="2.25"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="13"
        y="3.75"
        width="7.25"
        height="5.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="13"
        y="11.25"
        width="7.25"
        height="9"
        rx="2.25"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="3.75"
        y="15"
        width="7.25"
        height="5.25"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** 5. 动效与晚加载曲线：精密三次贝塞尔缓动锚点标。 */
export function MotionCurveGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <path
        d="M4.5 18.5C8.5 18.5 9.25 5.5 19.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4.5 18.5L9.5 18.5M14.5 5.5L19.5 5.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
      <circle cx="4.5" cy="18.5" r="2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19.5" cy="5.5" r="2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11.5" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** 6. 壳层框架：极简桌面双栏窗口标。 */
export function ShellWindowGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 4.75V19.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.25" y="5.25" width="4.5" height="13.5" rx="2" fill="currentColor" fillOpacity="0.1" />
      <path d="M12.25 9H17.5M12.25 12.5H16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

/** 7. 单一真源双路径：中心圆核 + 路径锁定锚点。 */
export function SingleSourceGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
      <circle
        cx="12"
        cy="12"
        r="4.25"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path
        d="M12 3.25V6M12 18V20.75M3.25 12H6M18 12H20.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 8. 纯软链接收敛网：单一节点精准投影至多客户端节点。 */
export function SymlinkMeshGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <rect
        x="3.5"
        y="9"
        width="6"
        height="6"
        rx="1.75"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9.75 12H13.25C14.75 12 14.5 6.75 16.5 6.75H17M9.75 12H17M9.75 12H13.25C14.75 12 14.5 17.25 16.5 17.25H17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="18.75" cy="6.75" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18.75" cy="12" r="1.75" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18.75" cy="17.25" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 9. 冲突裁决中心：双流并行对比与精准收敛菱形节点。 */
export function ConflictConvergeGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <circle cx="6.5" cy="6.5" r="2.25" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="6.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 8.75V11C6.5 12.65 7.85 14 9.5 14H14.5C16.15 14 17.5 12.65 17.5 11V8.75M12 14V16.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 16.5L14.75 18.75L12 21L9.25 18.75L12 16.5Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 10. Git 与云端金库：安全版本分支与云环图标。 */
export function GitVaultGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <path
        d="M7.25 18.25H17C19.2 18.25 20.75 16.7 20.75 14.65C20.75 12.8 19.45 11.35 17.65 11.1C17.15 8.05 14.6 5.75 11.45 5.75C8.1 5.75 5.4 8.35 5.25 11.65C3.9 12.1 3 13.3 3 14.8C3 16.75 4.65 18.25 7.25 18.25Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="11.5" r="1.25" fill="currentColor" />
      <circle cx="14.5" cy="14.5" r="1.25" fill="currentColor" />
      <path d="M10 12.75V14.5H13.25" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 11. 运维自愈与安全脉冲：精密六边形护盾标。 */
export function ShieldAuditGlyph({ size = 18, className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg {...glyphBase(size, className)} {...props}>
      <path
        d="M12 3.75L19 6.75V11.8C19 16.05 16.05 19.35 12 20.5C7.95 19.35 5 16.05 5 11.8V6.75L12 3.75Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 12.1L11.15 14L15 9.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center border shadow-[var(--shadow-control)]",
  {
    variants: {
      size: {
        xs: "size-6 rounded-[7px]",
        sm: "size-8 rounded-[9px]",
        md: "size-9 rounded-[10px]",
        lg: "size-11 rounded-xl",
      },
      tone: {
        neutral: "border-line bg-white text-ink-strong",
        surface: "border-line/80 bg-surface text-ink-mid",
        obsidian: "border-ink-strong bg-ink-strong text-white shadow-[var(--shadow-button)]",
        slate: "border-slate-200 bg-accent-soft text-accent-ink",
        success: "border-emerald-200/90 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200/90 bg-amber-50 text-amber-800",
        danger: "border-red-200/90 bg-red-50 text-red-700",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "neutral",
    },
  },
);

export interface IconBadgeProps extends VariantProps<typeof iconBadgeVariants> {
  children: ReactNode;
  className?: string;
}

/** 建筑感图标边框容器：为图标赋予高级商务锚点质感，消除裸露粗线图标的廉价感。 */
export function IconBadge({ size, tone, children, className }: IconBadgeProps): React.JSX.Element {
  return (
    <span className={cn(iconBadgeVariants({ size, tone }), className)} aria-hidden>
      {children}
    </span>
  );
}
