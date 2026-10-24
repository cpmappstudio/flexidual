"use client";

import * as React from "react";
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  Columns3,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { DataTableFilters } from "@/components/table/data-table-filters";
import { ResponsivePageAction } from "@/components/ui/responsive-page-action";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = { search: false };

export function DataTable<TData>({
  data,
  columns,
  filterColumn,
  filterPlaceholder,
  emptyMessage,
  columnsMenuLabel,
  columnVisibilityKey,
  exportButtonLabel,
  filterConfigs,
  filterAllLabel,
  filtersMenuLabel,
  resultsCountLabel,
  initialSorting,
  initialColumnFilters,
  pageSize,
  paginate = true,
  customFilter,
  createAction,
  onExport,
  onFilteredRowCountChange,
  onRowClick,
  server,
}: DataTableProps<TData>) {
  "use no memo"; // TanStack Table v8 exposes a mutable table API; React's documented compiler opt-out.
  const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE;
  const [sorting, setSorting] = React.useState<SortingState>(
    initialSorting ?? [],
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    initialColumnFilters ?? [],
  );
  const [visibility, setVisibility] = React.useState<{
    key?: string;
    value: VisibilityState;
    changed?: boolean;
  }>({ value: DEFAULT_COLUMN_VISIBILITY });
  // Never render another account/campus's preferences while its replacement loads.
  const columnVisibility =
    visibility.key === columnVisibilityKey
      ? visibility.value
      : DEFAULT_COLUMN_VISIBILITY;
  const [rowSelection, setRowSelection] = React.useState({});
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: resolvedPageSize,
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack v8 is intentionally outside React Compiler (use no memo above); keep its supported table API, pagination and filters.
  const table = useReactTable({
    data: data ?? [],
    columns,
    onSortingChange: server?.onSortingChange ?? setSorting,
    onColumnFiltersChange: (updater) => {
      if (server) return server.onColumnFiltersChange(updater);
      setColumnFilters(updater);
      setPagination((current) =>
        current.pageIndex === 0 ? current : { ...current, pageIndex: 0 },
      );
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel:
      paginate && !server ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: (updater) => {
      setVisibility((current) => {
        const previous =
          current.key === columnVisibilityKey
            ? current.value
            : DEFAULT_COLUMN_VISIBILITY;
        return {
          key: columnVisibilityKey,
          value: typeof updater === "function" ? updater(previous) : updater,
          changed: true,
        };
      });
    },
    onRowSelectionChange: setRowSelection,
    autoResetPageIndex: false,
    manualPagination: Boolean(server),
    manualSorting: Boolean(server),
    manualFiltering: Boolean(server),
    state: {
      sorting: server?.sorting ?? sorting,
      columnFilters: server?.columnFilters ?? columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  });

  const t = useTranslations();

  React.useEffect(() => {
    if (!columnVisibilityKey) return;
    const value = { ...DEFAULT_COLUMN_VISIBILITY };
    try {
      const raw = localStorage.getItem(columnVisibilityKey);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        const preferences = stored as Record<string, unknown>;
        for (const column of table.getAllLeafColumns()) {
          if (
            column.getCanHide() &&
            Object.hasOwn(preferences, column.id) &&
            typeof preferences[column.id] === "boolean"
          )
            value[column.id] = preferences[column.id] as boolean;
        }
      }
    } catch {
      // Malformed or unavailable browser storage must not block the directory.
    }
    setVisibility({ key: columnVisibilityKey, value });
  }, [columnVisibilityKey, table]);

  React.useEffect(() => {
    // Persist only committed local changes, never the initial load or another scope.
    if (
      !columnVisibilityKey ||
      visibility.key !== columnVisibilityKey ||
      !visibility.changed
    )
      return;
    try {
      localStorage.setItem(
        columnVisibilityKey,
        JSON.stringify(visibility.value),
      );
    } catch {
      // Optional UI preference: keep working in memory if storage is full/blocked.
    }
  }, [columnVisibilityKey, visibility]);

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

  React.useEffect(() => {
    if (!paginate || server) return;
    const lastPageIndex = Math.max(0, table.getPageCount() - 1);
    setPagination((current) =>
      current.pageIndex > lastPageIndex
        ? { ...current, pageIndex: lastPageIndex }
        : current,
    );
  }, [filteredRowsCount, paginate, table, server]);

  React.useEffect(() => {
    if (!server) onFilteredRowCountChange?.(filteredRowsCount);
  }, [filteredRowsCount, onFilteredRowCountChange, server]);

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

  const columnSelector = columnVisibilityKey ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="bg-card"
          aria-label={columnsMenuLabel ?? t("table.columns")}
        >
          <Columns3 aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {table
          .getAllLeafColumns()
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(value) =>
                column.toggleVisibility(value === true)
              }
            >
              {(column.columnDef.meta as { label?: string } | undefined)
                ?.label ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div className="min-w-0 w-full">
      <div className="flex min-w-0 items-center gap-2 pb-4">
        {filterColumnInstance ? (
          <InputGroup className="w-auto min-w-0 flex-1 bg-card">
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
        {(customFilter ||
          columnVisibilityKey ||
          !!filterConfigs?.length ||
          onExport ||
          createAction) && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {customFilter}

            {filterConfigs && filterConfigs.length > 0 && (
              <DataTableFilters
                table={table}
                filterConfigs={filterConfigs}
                allLabel={filterAllLabel}
                filtersMenuLabel={filtersMenuLabel ?? t("table.filters")}
                clearFiltersLabel={t("table.clearFilters")}
              />
            )}

            {onExport && (
              <Button variant="outline" onClick={exportRows}>
                <Download className="size-3.5" />
                <span className="hidden md:block mr-1">
                  {exportButtonLabel}
                </span>
              </Button>
            )}

            {createAction ? (
              <ResponsivePageAction className="flex items-center gap-2">
                {columnSelector}
                {createAction}
              </ResponsivePageAction>
            ) : (
              columnSelector
            )}
          </div>
        )}
      </div>

      {resolvedResultsCountLabel && (
        <div className="pb-2 text-muted-foreground text-sm font-medium">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {renderResultsCount(false)}
          </div>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-md border">
        <Table className="bg-card" aria-busy={server?.isLoading}>
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
                    onRowClick
                      ? "cursor-pointer transition-colors hover:bg-muted/50"
                      : undefined
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
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center"
                >
                  {server?.isLoading ? t("common.loading") : emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {paginate && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-muted-foreground text-sm font-medium">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {renderResultsCount(true)}
              <span>
                {server
                  ? t("table.pageNumber", { current: server.pageIndex + 1 })
                  : t("table.pageInfo", {
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
              className="bg-sidebar"
              onClick={() =>
                server ? server.onPrevious() : table.previousPage()
              }
              disabled={
                server
                  ? server.isLoading || server.pageIndex === 0
                  : !table.getCanPreviousPage()
              }
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="bg-sidebar"
              onClick={() => (server ? server.onNext() : table.nextPage())}
              disabled={
                server
                  ? server.isLoading || !server.hasNext
                  : !table.getCanNextPage()
              }
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
