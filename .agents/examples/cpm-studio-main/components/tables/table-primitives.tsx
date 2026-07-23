import type { ComponentProps, ReactNode } from "react";
import { MoreHorizontalCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function TableSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-border/70 bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableStateRow({
  children,
  colSpan,
}: {
  children: ReactNode;
  colSpan: number;
}) {
  return (
    <TableRow className="bg-card hover:bg-card">
      <TableCell
        colSpan={colSpan}
        className="py-8 text-center text-sm text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
}

export function TableActionsCell({ children }: { children: ReactNode }) {
  return (
    <TableCell className="pr-5">
      <div className="flex justify-end">{children}</div>
    </TableCell>
  );
}

export function TableActionsMenuButton({
  className,
  label,
  type = "button",
  variant = "ghost",
  size = "icon",
  ...props
}: {
  label: string;
} & ComponentProps<typeof Button>) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn("size-8", className)}
      {...props}
    >
      <HugeiconsIcon
        icon={MoreHorizontalCircle01Icon}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
