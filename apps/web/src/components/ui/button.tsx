import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** ui-design-v2 §6:default 墨色;accent 信号色面(每屏最多一个);其余灰阶。 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap outline-none motion-press focus-visible:ring-2 focus-visible:ring-volt-fill/70 focus-visible:ring-offset-1 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink-strong text-white shadow-card hover:bg-ink-strong/88",
        accent: "border border-volt-line bg-volt-fill text-volt-ink shadow-card hover:brightness-[0.97]",
        outline: "border border-line bg-card text-ink-strong shadow-card hover:border-line-strong hover:bg-surface",
        ghost: "text-ink-mid hover:bg-surface hover:text-ink-strong",
        destructive: "border border-red-200 bg-card text-red-700 hover:border-red-300 hover:bg-red-50",
        link: "text-ink-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-4",
        icon: "size-8",
        "icon-sm": "size-7 rounded-md",
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
