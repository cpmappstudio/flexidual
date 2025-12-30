"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { LessonDialog } from "@/components/teaching/lessons/lesson-dialog"

export default function CurriculumDetailPage() {
  const params = useParams()
  const router = useRouter()
  const curriculumId = params.curriculumId as Id<"curriculums">
  
  const curriculum = useQuery(api.curriculums.get, { id: curriculumId })
  const lessons = useQuery(api.lessons.listByCurriculum, { curriculumId })

  if (curriculum === undefined || lessons === undefined) {
    return <div className="p-6"><Skeleton className="h-64 w-full" /></div>
  }

  if (curriculum === null) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Curriculum not found</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Navigation Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Curriculum Meta */}
      <div className="flex flex-col gap-2 border-b pb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{curriculum.title}</h1>
          {curriculum.code && <Badge variant="outline" className="text-sm">{curriculum.code}</Badge>}
        </div>
        <p className="text-lg text-muted-foreground max-w-3xl">
          {curriculum.description || "No description provided."}
        </p>
      </div>

      {/* Lessons List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lessons ({lessons.length})</CardTitle>
          <LessonDialog curriculumId={curriculumId} />
        </CardHeader>
        <CardContent className="space-y-2">
          {lessons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
              <p>No lessons yet.</p>
              <p className="text-sm">Click "Add Lesson" to start building your course.</p>
            </div>
          ) : (
            lessons.map((lesson, index) => (
              <div 
                key={lesson._id} 
                className="group flex items-center gap-4 p-4 border rounded-lg bg-card hover:bg-accent/50 transition-all"
              >
                {/* Order Badge */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {index + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{lesson.title}</p>
                  {lesson.description && (
                    <p className="text-sm text-muted-foreground truncate">{lesson.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <LessonDialog curriculumId={curriculumId} lesson={lesson} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}