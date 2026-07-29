"use client";

import { Table } from "@tanstack/react-table";

import { ResponsiveFilters } from "@/components/ui/responsive-filters";
import type { FilterConfig } from "@/lib/table/types";

interface DataTableFiltersProps<TData> {
  table: Table<TData>;
  filterConfigs: FilterConfig[];
  filtersMenuLabel?: string;
  clearFiltersLabel?: string;
  allLabel?: string;
}

export function DataTableFilters<TData>({
  table,
  filterConfigs,
  filtersMenuLabel,
  clearFiltersLabel,
  allLabel,
}: DataTableFiltersProps<TData>) {
  const filters = filterConfigs.flatMap((config) => {
    const column = table.getColumn(config.id);
    if (!column) return [];

    return [
      {
        key: config.id,
        label: config.label,
        allLabel: allLabel ?? config.label,
        value: (column.getFilterValue() as string[] | undefined)?.[0] ?? null,
        options: config.options,
        onChange: (value: string | null) =>
          column.setFilterValue(value ? [value] : undefined),
      },
    ];
  });

  return (
    <ResponsiveFilters
      filters={filters}
      menuLabel={filtersMenuLabel ?? "Filter by"}
      clearLabel={clearFiltersLabel ?? "Clear all filters"}
    />
  );
}
