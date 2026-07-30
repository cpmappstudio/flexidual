"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ColumnDef } from "@tanstack/react-table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { LessonDialog } from "@/components/teaching/lessons/lesson-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"
import { DataTable } from "@/components/table/data-table"
import { createSearchColumn } from "@/components/table/column-helpers"

export function LessonsTable() {
  const t = useTranslations()
  const curriculums = useQuery(api.curriculums.list, { includeInactive: true })
  curriculums?.sort((a, b) => a.title.localeCompare(b.title))
  
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | "">("")

  const lessons = useQuery(api.lessons.listByCurriculum, 
    selectedCurriculumId ? { curriculumId: selectedCurriculumId as Id<"curriculums"> } : "skip"
  )

  const columns: ColumnDef<Doc<"lessons">, unknown>[] = useMemo(() => [
      createSearchColumn<Doc<"lessons">>(["title", "description"]),
      {
        accessorKey: "order",
        header: "#",
        cell: ({ row }) => <span className="text-muted-foreground font-mono">{row.original.order}</span>,
      },
      {
        accessorKey: "title",
        header: t('lesson.title'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.getValue("title")}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[300px]">{row.original.description}</div>
          </div>
        )
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <LessonDialog
              lesson={row.original}
              curriculumId={row.original.curriculumId}
            />
          </div>
        ),
      },
    ], [t])

  const data = useMemo(() => lessons || [], [lessons])
  const isLoadingLessons = Boolean(selectedCurriculumId && lessons === undefined)

  // Auto-select first curriculum
  useEffect(() => {
    if (curriculums && curriculums.length && !selectedCurriculumId) {
      setSelectedCurriculumId(curriculums[0]._id)
    }
  }, [curriculums, selectedCurriculumId])

  if (curriculums === undefined) return <Skeleton className="h-96 w-full" />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="w-full max-w-sm">
            <Select 
                value={selectedCurriculumId} 
                onValueChange={(val) => setSelectedCurriculumId(val as Id<"curriculums">)}
            >
                <SelectTrigger>
                    <SelectValue placeholder={t('lesson.selectCurriculum')} />
                </SelectTrigger>
                <SelectContent>
                    {curriculums?.map((c) => (
                        <SelectItem key={c._id} value={c._id}>{c.title}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        
        {/* Consistent Dialog Action */}
        {selectedCurriculumId && (
          <LessonDialog curriculumId={selectedCurriculumId as Id<"curriculums">} />
        )}
      </div>

      {isLoadingLessons ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DataTable
          data={data}
          columns={columns}
          filterColumn="search"
          filterPlaceholder={t("common.searchByName")}
          emptyMessage={
            selectedCurriculumId
              ? t("lesson.noLessonsForCurriculum")
              : t("lesson.selectCurriculumPrompt")
          }
        />
      )}
    </div>
  )
}
