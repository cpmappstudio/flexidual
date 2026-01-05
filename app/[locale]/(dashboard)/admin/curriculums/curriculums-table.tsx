"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { Doc } from "@/convex/_generated/dataModel"
import { useState } from "react"
import { useTranslations } from "next-intl"

const columns: ColumnDef<Doc<"curriculums">>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.getValue("title")}</div>
        <div className="text-xs text-muted-foreground">{row.original.description}</div>
      </div>
    ),
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => <Badge variant="outline">{row.getValue("code") || "N/A"}</Badge>,
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "default" : "secondary"}>
        {row.original.isActive ? "Active" : "Archived"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <div className="flex justify-end"><CurriculumDialog curriculum={row.original} /></div>,
  },
]

export function CurriculumsTable() {
  const t = useTranslations()
  const data = useQuery(api.curriculums.list, { includeInactive: true })
  const [filter, setFilter] = useState("")

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
  })

  if (!data) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder={t('curriculum.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
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