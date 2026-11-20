import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  checked,
  onCheckedChange,
  disabled,
  ...props
}: {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
} & Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "checked" | "onCheckedChange" | "className">): React.JSX.Element {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange?.(next === true)}
      disabled={disabled}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-line-strong/80 bg-white shadow-[var(--shadow-control)] outline-none motion-fill hover:border-ink-strong/60 data-checked:border-ink-strong data-checked:bg-ink-strong disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex text-white">
        <Check className="size-3" strokeWidth={2.2} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
