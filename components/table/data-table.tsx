"use client";

import * as React from "react";
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { DataTableFilters } from "@/components/table/data-table-filters";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataTableProps } from "@/lib/table/types";
import { shouldHandleRowClick } from "@/lib/table/utils";

const DEFAULT_PAGE_SIZE = 10;

export function DataTable<TData>({
  data,
  columns,
  filterColumn,
  filterPlaceholder,
  emptyMessage,
  exportButtonLabel,
  filterConfigs,
  filtersMenuLabel,
  resultsCountLabel,
  initialSorting,
  initialColumnFilters,
  pageSize,
  customFilter,
  createAction,
  onExport,
  onRowClick,
}: DataTableProps<TData>) {
  const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  const [sorting, setSorting] = React.useState<SortingState>(
    initialSorting ?? [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    initialColumnFilters ?? [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      search: false,
    });
  const [rowSelection, setRowSelection] = React.useState({});

  const table = useReactTable({
    data: data ?? [],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    initialState: {
      pagination: {
        pageSize: resolvedPageSize,
      },
      sorting: initialSorting,
    },
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const t = useTranslations();

  const filterColumnInstance = filterColumn
    ? table.getColumn(filterColumn)
    : undefined;
  const filteredRowsCount = table.getFilteredRowModel().rows.length;
  const totalRowsCount = table.getCoreRowModel().rows.length;
  const hasFilteredRows = filteredRowsCount !== totalRowsCount;
  const resolvedResultsCountLabel = resultsCountLabel?.(
    filteredRowsCount,
    totalRowsCount,
    hasFilteredRows,
  );
  const renderResultsCount = (withSeparator: boolean) => {
    if (!resolvedResultsCountLabel) {
      return null;
    }

    return (
      <>
        <span>{resolvedResultsCountLabel}</span>
        {withSeparator && <span aria-hidden="true">•</span>}
      </>
    );
  };

  const handleRowClick = React.useCallback(
    (rowData: TData) => {
      onRowClick?.(rowData);
    },
    [onRowClick],
  );

  const handleRowContainerClick = React.useCallback(
    (
      event: React.MouseEvent<HTMLTableRowElement, MouseEvent>,
      rowData: TData,
    ) => {
      if (!onRowClick || !shouldHandleRowClick(event)) {
        return;
      }
      handleRowClick(rowData);
    },
    [handleRowClick, onRowClick],
  );

  const exportRows = React.useCallback(() => {
    if (!onExport) {
      return;
    }
    const rows = table
      .getFilteredRowModel()
      .rows.map((row) => row.original as TData);
    onExport(rows);
  }, [onExport, table]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 pb-4">
        {filterColumnInstance ? (
          <InputGroup className="bg-card">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={filterPlaceholder}
              value={(filterColumnInstance.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                filterColumnInstance.setFilterValue(event.target.value)
              }
              className="max-w-sm"
            />
          </InputGroup>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {customFilter}

          {filterConfigs && filterConfigs.length > 0 && (
            <DataTableFilters
              table={table}
              filterConfigs={filterConfigs}
              filtersMenuLabel={filtersMenuLabel}
            />
          )}

          {onExport && (
            <Button variant="outline" onClick={exportRows}>
              <Download className="size-3.5" />
              <span className="hidden md:block mr-1">{exportButtonLabel}</span>
            </Button>
          )}

          {createAction}
        </div>
      </div>

      {resolvedResultsCountLabel && (
        <div className="pb-2 text-muted-foreground text-sm font-medium">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {renderResultsCount(false)}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border">
        <Table className="bg-card">
          <TableHeader className="bg-primary/95 sticky top-0 z-10 ">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:bg-transparent data-[state=selected]:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { className?: string }
                    | undefined;
                  return (
                    <TableHead
                      className={`text-muted ${meta?.className || ""}`}
                      key={header.id}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={
                    onRowClick ? "cursor-pointer transition-colors hover:bg-muted/50" : undefined
                  }
                  onClick={
                    onRowClick
                      ? (event) => handleRowContainerClick(event, row.original)
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { className?: string }
                      | undefined;
                    return (
                      <TableCell
                        key={cell.id}
                        className={meta?.className || ""}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-muted-foreground text-sm font-medium">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {renderResultsCount(true)}
            <span>
              {t("table.pageInfo", {
                current: table.getState().pagination.pageIndex + 1,
                total: table.getPageCount(),
              })}
            </span>
          </div>
        </div>

        <div className="space-x-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
