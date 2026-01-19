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
import { ArrowUpDown, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CurriculumsTable() {
  const t = useTranslations()
  const data = useQuery(api.curriculums.list, { includeInactive: true })
  const [filter, setFilter] = useState("")
  const [sorting, setSorting] = React.useState([])

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
          {row.original.isActive ? t('common.active') : t('common.archived')}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex justify-end">
            <CurriculumDialog curriculum={row.original} />
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
        // @ts-ignore - tanstack table typing issue with simple sorting
        sorting 
    },
    // @ts-ignore
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
  })

  if (!data) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
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
        
        {/* Consistent Action Placement */}
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
                <TableRow key={row.id}>
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
    </div>
  )
}