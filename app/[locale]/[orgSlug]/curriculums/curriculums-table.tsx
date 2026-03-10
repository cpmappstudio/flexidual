"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { Doc } from "@/convex/_generated/dataModel"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/table/data-table"
import { createSearchColumn, createSortableHeader } from "@/components/table/column-helpers"
import type { FilterConfig } from "@/lib/table/types"

export function CurriculumsTable() {
  const t = useTranslations()
  const data = useQuery(api.curriculums.list, { includeInactive: true })
  
  const [editingCurriculum, setEditingCurriculum] = useState<Doc<"curriculums"> | null>(null)

  const filterConfigs: FilterConfig[] = [
    {
      id: "isActive",
      label: t('common.status'),
      options: [
        { value: "true", label: t('common.active') },
        { value: "false", label: t('common.inactive') }
      ]
    }
  ]

  const columns: ColumnDef<Doc<"curriculums">, unknown>[] = [
    createSearchColumn<Doc<"curriculums">>(["title", "description", "code"]),
    {
      accessorKey: "title",
      header: createSortableHeader(t('common.title')),
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
      header: createSortableHeader(t('common.code')),
      cell: ({ row }) => {
        const code = row.getValue("code") as string
        return code ? <Badge variant="outline">{code}</Badge> : <span className="text-muted-foreground text-xs">-</span>
      },
    },
    {
      accessorKey: "isActive",
      header: createSortableHeader(t('common.status')),
      filterFn: (row, id, filterValues: string[]) => {
        return filterValues.includes(String(row.getValue(id)));
      },
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
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

      <DataTable
        data={data}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t('curriculum.filterPlaceholder')}
        emptyMessage={t('common.noResults')}
        filterConfigs={filterConfigs}
        initialColumnFilters={[{ id: "isActive", value: ["true"] }]}
        createAction={<CurriculumDialog />}
        pageSize={10}
        onRowClick={(curriculum) => setEditingCurriculum(curriculum)}
      />
    </div>
  )
}