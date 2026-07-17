import type { ColumnDef, SortingState } from "@tanstack/react-table";
import type { ReactNode } from "react";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterConfig {
  id: string;
  label: string;
  options: FilterOption[];
}

export interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  filterColumn?: string;
  filterPlaceholder?: string;
  emptyMessage?: string;
  columnsMenuLabel?: string;
  exportButtonLabel?: string;
  filterConfigs?: FilterConfig[];
  filtersMenuLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  selectedRowsLabel?: (selected: number, total: number) => string;
  resultsCountLabel?: (
    filtered: number,
    total: number,
    isFiltered: boolean,
  ) => string;
  initialSorting?: SortingState;
  pageSize?: number;
  enableRowSelection?: boolean;
  onCreate?: () => void;
  onExport?: (rows: TData[]) => void;
  onRowClick?: (row: TData) => void;
  renderBulkActions?: (
    selectedRows: TData[],
    clearSelection: () => void,
  ) => ReactNode;
  renderRowContextMenu?: (row: TData) => ReactNode;
}

export type Translator = (key: string) => string;
