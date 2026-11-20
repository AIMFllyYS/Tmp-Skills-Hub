import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-[var(--shadow-card)]">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return (
    <thead
      className={cn("border-b border-line bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-faint", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>): React.JSX.Element {
  return (
    <tr
      className={cn(
        "h-10 motion-fill hover:bg-canvas/75",
        className,
      )}
      {...props}
    />
  );
}

export function TableTh({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <th className={cn("px-3.5 py-2.5 font-medium", className)} {...props} />;
}

export function TableTd({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <td className={cn("px-3.5 py-2.5 text-ink-mid", className)} {...props} />;
}
