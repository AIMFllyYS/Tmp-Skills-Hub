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
        "flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-card outline-none motion-fill focus-visible:ring-2 focus-visible:ring-volt-fill/60 data-checked:border-volt/60 data-checked:bg-volt-fill",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex text-volt-ink">
        <Check className="size-3" strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
