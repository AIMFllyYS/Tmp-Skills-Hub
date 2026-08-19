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
      <MenuPrimitive.Positioner sideOffset={4} className="z-50">
        <MenuPrimitive.Popup
          className={cn("min-w-40 rounded-lg border border-line bg-white py-1 outline-none", className)}
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
        "flex w-full cursor-default items-center px-3 py-1.5 text-left text-sm text-ink-mid outline-none select-none data-highlighted:bg-surface data-highlighted:text-ink-strong",
        className,
      )}
      {...props}
    />
  );
}
