import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.Popup>): React.JSX.Element {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={6} className="z-50">
        <MenuPrimitive.Popup
          className={cn(
            "min-w-44 rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-overlay)] outline-none",
            "origin-top-left transition-[opacity,transform] duration-fast ease-smooth motion-reduce:transition-none",
            "data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item>): React.JSX.Element {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-sm text-ink-mid outline-none select-none motion-fill data-highlighted:bg-surface data-highlighted:text-ink-strong",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Separator>): React.JSX.Element {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}
