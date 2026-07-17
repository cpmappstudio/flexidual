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
  Columns3Icon,
  Download,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableFilters } from "@/components/table/data-table-filters";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";

const DEFAULT_PAGE_SIZE = 50;

export function DataTable<TData>({
  data,
  columns,
  filterColumn,
  filterPlaceholder,
  emptyMessage,
  exportButtonLabel,
  filterConfigs,
  filtersMenuLabel,
  selectedRowsLabel,
  resultsCountLabel,
  initialSorting,
  pageSize,
  enableRowSelection,
  onCreate,
  onExport,
  onRowClick,
  renderBulkActions,
  renderRowContextMenu,
}: DataTableProps<TData>) {
  const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  const [sorting, setSorting] = React.useState<SortingState>(
    initialSorting ?? [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
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
    enableRowSelection: enableRowSelection ?? false,
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

  const t = useTranslations("Common");

  const filterColumnInstance = filterColumn
    ? table.getColumn(filterColumn)
    : undefined;
  const filteredRowsCount = table.getFilteredRowModel().rows.length;
  const totalRowsCount = table.getCoreRowModel().rows.length;
  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original as TData);
  const selectedRowsCount = selectedRows.length;
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

  const clearRowSelection = React.useCallback(() => {
    setRowSelection({});
  }, []);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 pb-4">
        {filterColumnInstance ? (
          <InputGroup className="bg-card">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
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
        {onCreate && (
          <Button onClick={onCreate} size="icon" className="">
            <Plus className="size-4 " />
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild className="hidden md:flex">
              <Button variant="outline" size="icon">
                {/* <span className="hidden md:block mr-1">{columnsMenuLabel}</span> */}
                <Columns3Icon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectedRowsCount > 0 && renderBulkActions ? (
        <div className="pb-2 text-sm font-medium">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-muted-foreground">
              {selectedRowsLabel?.(selectedRowsCount, filteredRowsCount) ??
                t("table.selectedRows", {
                  selected: selectedRowsCount,
                  total: filteredRowsCount,
                })}
            </span>
            <div className="flex items-center gap-2">
              {renderBulkActions(selectedRows, clearRowSelection)}
            </div>
          </div>
        </div>
      ) : resolvedResultsCountLabel ? (
        <div className="pb-2 text-muted-foreground text-sm font-medium">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {renderResultsCount(false)}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border">
        <Table className="bg-card">
          <TableHeader className="bg-primary sticky top-0 z-10 ">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="hover:bg-transparent data-[state=selected]:bg-transparent"
              >
                {enableRowSelection && (
                  <TableHead className="w-10 text-muted">
                    <Checkbox
                      checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && "indeterminate")
                      }
                      onCheckedChange={(value) =>
                        table.toggleAllPageRowsSelected(!!value)
                      }
                      aria-label={t("table.selectPage")}
                    />
                  </TableHead>
                )}
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { className?: string; headerClassName?: string }
                    | undefined;
                  return (
                    <TableHead
                      className={`text-muted ${meta?.className || ""} ${meta?.headerClassName || ""}`}
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
              table.getRowModel().rows.map((row) => {
                const rowContextMenu = renderRowContextMenu?.(row.original);

                const rowElement = (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={
                      onRowClick
                        ? "cursor-pointer transition-colors"
                        : undefined
                    }
                    onClick={
                      onRowClick
                        ? (event) =>
                            handleRowContainerClick(event, row.original)
                        : undefined
                    }
                  >
                    {enableRowSelection && (
                      <TableCell className="w-10">
                        <Checkbox
                          checked={row.getIsSelected()}
                          onCheckedChange={(value) =>
                            row.toggleSelected(!!value)
                          }
                          aria-label={t("table.selectRow")}
                        />
                      </TableCell>
                    )}
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        { className?: string } | undefined;
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
                );

                if (!rowContextMenu) {
                  return rowElement;
                }

                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>
                      {rowElement}
                    </ContextMenuTrigger>
                    <ContextMenuContent
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      {rowContextMenu}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (enableRowSelection ? 1 : 0)}
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
        {/* <div className="flex-1 text-sm text-muted-foreground">
                    {selectedRowsLabel?.(
                        table.getFilteredSelectedRowModel().rows.length,
                        table.getFilteredRowModel().rows.length
                    ) ?? `${table.getFilteredSelectedRowModel().rows.length} of ${table.getFilteredRowModel().rows.length} row(s) selected.`}
                </div> */}

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
