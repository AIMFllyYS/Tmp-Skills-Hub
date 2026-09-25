import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export function Switch({
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
} & Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "checked" | "onCheckedChange" | "className">): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange?.(next)}
      disabled={disabled}
      className={cn(
        "group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line-strong bg-surface-strong outline-none transition-colors duration-normal ease-spring focus-visible:ring-2 focus-visible:ring-volt-fill/60 data-checked:border-volt/60 data-checked:bg-volt-fill disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-[3px] rounded-full bg-card shadow-thumb transition-transform duration-normal ease-spring motion-reduce:transition-none group-data-checked:translate-x-[17px]" />
    </SwitchPrimitive.Root>
  );
}
