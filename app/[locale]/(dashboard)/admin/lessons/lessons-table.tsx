"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
} from "@tanstack/react-table"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { LessonDialog } from "@/components/teaching/lessons/lesson-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

// Define columns
const columns: ColumnDef<Doc<"lessons">>[] = [
  {
    accessorKey: "order",
    header: "#",
    cell: ({ row }) => <span className="text-muted-foreground font-mono">{row.original.order}</span>,
  },
  {
    accessorKey: "title",
    header: "Lesson Title",
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
]

export function LessonsTable() {
  const t = useTranslations()
  const curriculums = useQuery(api.curriculums.list, { includeInactive: true })
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | "">("")

  const lessons = useQuery(api.lessons.listByCurriculum, 
    selectedCurriculumId ? { curriculumId: selectedCurriculumId as Id<"curriculums"> } : "skip"
  )

  const data = useMemo(() => lessons || [], [lessons])
  const isLoadingLessons = selectedCurriculumId && lessons === undefined

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  useEffect(() => {
    if (curriculums && curriculums.length && !selectedCurriculumId) {
      setSelectedCurriculumId(curriculums[0]._id)
    }
  }, [curriculums])

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
                    {curriculums.map((c) => (
                        <SelectItem key={c._id} value={c._id}>{c.title}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        
        {selectedCurriculumId && (
          <LessonDialog curriculumId={selectedCurriculumId as Id<"curriculums">} />
        )}
      </div>

      <div className="rounded-md border">
        {isLoadingLessons && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )}

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
            {!selectedCurriculumId ? (
                <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                        {t('lesson.selectCurriculumPrompt')}
                    </TableCell>
                </TableRow>
            ) : table.getRowModel().rows.length ? (
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
              !isLoadingLessons && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {t('lesson.noLessonsForCurriculum')}
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}