"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { Doc } from "@/convex/_generated/dataModel"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowUpDown, Edit, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface CurriculumsTableProps {
  includeInactive?: boolean
}

export function CurriculumsTable({ includeInactive = false }: CurriculumsTableProps) {
  const t = useTranslations()
  const data = useQuery(api.curriculums.list, { includeInactive })
  
  const [filter, setFilter] = useState("")
  const [sorting, setSorting] = React.useState([])
  const [editingCurriculum, setEditingCurriculum] = useState<Doc<"curriculums"> | null>(null)

  const columns: ColumnDef<Doc<"curriculums">>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          {t('common.title')} <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-base">{row.getValue("title")}</div>
          <div className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">
            {row.original.description}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: t('common.code'),
      cell: ({ row }) => {
        const code = row.getValue("code") as string
        return code ? <Badge variant="outline">{code}</Badge> : <span className="text-muted-foreground text-xs">-</span>
      },
    },
    {
      accessorKey: "isActive",
      header: t('common.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex justify-end">
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={(e) => {
                    e.stopPropagation()
                    setEditingCurriculum(row.original)
                }}
            >
                <Edit className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">{t('common.edit')}</span>
            </Button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { 
        globalFilter: filter,
        sorting 
    },
    // @ts-expect-error - tanstack table typing issue
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  })

  if (!data) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      {editingCurriculum && (
        <CurriculumDialog 
            curriculum={editingCurriculum}
            open={true}
            onOpenChange={(open) => !open && setEditingCurriculum(null)}
            trigger={<span className="hidden" />}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('curriculum.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        
        <CurriculumDialog />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow 
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setEditingCurriculum(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {t('common.rowsPerPage')}
          </p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-sm text-muted-foreground">
            {t('common.pageOfPages', {
              current: table.getState().pagination.pageIndex + 1,
              total: table.getPageCount()
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              {t('common.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t('common.next')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}