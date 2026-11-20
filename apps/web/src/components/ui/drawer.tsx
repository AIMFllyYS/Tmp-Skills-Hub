import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button.js";
import { ScrollArea } from "./scroll-area.js";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/** 右侧滑入抽屉（无毛玻璃、无大阴影，使用 --ease-smooth 动效，用于历史抽屉与详情检查）。 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  headerExtra,
  footer,
  children,
  className,
  testId,
}: DrawerProps): React.JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="dialog-backdrop fixed inset-0 z-50 bg-ink-strong/40" />
        <DialogPrimitive.Popup
          data-testid={testId}
          className={cn(
            "drawer-popup fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-xl flex-col border-l border-line bg-white outline-none",
            className,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-medium text-ink-strong">
                {title}
              </DialogPrimitive.Title>
              {description !== undefined && description !== "" && (
                <DialogPrimitive.Description className="mt-1 text-xs text-ink-mid">
                  {description}
                </DialogPrimitive.Description>
              )}
              {headerExtra !== undefined && <div className="mt-2">{headerExtra}</div>}
            </div>
            <DialogPrimitive.Close
              render={
                <Button type="button" variant="ghost" size="icon" aria-label="关闭抽屉">
                  <X className="size-4 text-ink-mid" aria-hidden />
                </Button>
              }
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-5">{children}</div>
          </ScrollArea>
          {footer !== undefined && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
