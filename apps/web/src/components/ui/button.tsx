import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-medium outline-none motion-press focus-visible:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-ink-strong bg-ink-strong text-white shadow-[var(--shadow-button)] hover:bg-ink-strong/92",
        outline:
          "border border-line bg-white text-ink-strong shadow-[var(--shadow-control)] hover:border-line-strong hover:bg-canvas",
        secondary:
          "border border-transparent bg-surface text-ink-strong hover:bg-surface-hover",
        ghost: "text-ink-mid hover:bg-surface hover:text-ink-strong",
        destructive:
          "border border-red-200/90 bg-white text-red-700 shadow-[var(--shadow-control)] hover:border-red-300 hover:bg-red-50/70",
        link: "text-ink-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-[9px] px-3 text-xs",
        icon: "size-8 rounded-[9px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>): React.JSX.Element {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
