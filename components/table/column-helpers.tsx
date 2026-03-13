import type { ReactNode } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const createSearchColumn = <T,>(
  fields: Array<keyof T>,
): ColumnDef<T> => ({
  id: "search",
  accessorFn: (row) => {
    return fields
      .map((field) => String(row[field] ?? ""))
      .join(" ")
      .toLowerCase();
  },
  enableHiding: false,
  enableSorting: false,
  enableColumnFilter: true,
  meta: {
    filterOnly: true,
  },
});

type SortState = false | "asc" | "desc";

interface SortableHeaderColumn {
  toggleSorting: (desc?: boolean) => void;
  getIsSorted: () => SortState;
}

interface SortableHeaderOptions {
  className?: string;
}

export const createSortableHeader = (
  label: ReactNode,
  options?: SortableHeaderOptions,
) => {
  return ({ column }: { column: SortableHeaderColumn }) => {
    const sortState = column.getIsSorted();
    const SortIcon =
      sortState === "asc"
        ? ArrowUp
        : sortState === "desc"
          ? ArrowDown
          : ArrowUpDown;

    return (
      <Button
        variant="ghost"
        className={cn(
          "h-auto p-0 hover:bg-transparent text-inherit hover:text-primary-foreground font-medium",
          options?.className,
        )}
        onClick={() => column.toggleSorting(sortState === "asc")}
      >
        {label}
        <SortIcon className="ml-2 h-4 w-4" />
      </Button>
    );
  };
};

export const createTextColumn = <T extends Record<string, unknown>>(
  accessorKey: keyof T & string,
  header: string,
  options?: { sortable?: boolean },
): ColumnDef<T> => ({
  accessorKey,
  header: options?.sortable ? createSortableHeader(header) : header,
  cell: ({ row }) => row.getValue(accessorKey) ?? "-",
});

export const createNumericColumn = <T extends Record<string, unknown>>(
  accessorKey: keyof T & string,
  header: string,
  emptyValue = "-",
): ColumnDef<T> => ({
  accessorKey,
  header: () => <div className="text-right">{header}</div>,
  cell: ({ row }) => {
    const value = row.getValue(accessorKey) as number | undefined;
    return <div className="text-right font-medium">{value ?? emptyValue}</div>;
  },
});

export const createMappedColumn = <T extends Record<string, unknown>>(
  accessorKey: keyof T & string,
  header: string,
  labels: Record<string, string>,
  emptyValue = "-",
): ColumnDef<T> => ({
  accessorKey,
  header,
  cell: ({ row }) => {
    const value = row.getValue(accessorKey) as string | undefined;
    return value ? (labels[value] ?? emptyValue) : emptyValue;
  },
});

export interface StatusConfig {
  label: string;
  className: string;
}

export const createStatusColumn = <T extends Record<string, unknown>>(
  accessorKey: keyof T & string,
  header: string,
  statusLabels: Record<string, StatusConfig>,
): ColumnDef<T> => ({
  accessorKey,
  header,
  cell: ({ row }) => {
    const status = row.getValue(accessorKey) as string;
    const config = statusLabels[status] ?? { label: status, className: "" };
    return (
      <span
        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${config.className}`}
      >
        {config.label}
      </span>
    );
  },
  filterFn: (row, id, value: string[]) => {
    return value.includes(row.getValue(id));
  },
});
