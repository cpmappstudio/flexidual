// app/[locale]/(dashboard)/lessons/[lessonId]/page.tsx
"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useParams, useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, FileText } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { LessonDialog } from "@/components/teaching/lessons/lesson-dialog"

export default function LessonReaderPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.lessonId as Id<"lessons">
  
  const lesson = useQuery(api.lessons.get, { id: lessonId })

  if (lesson === undefined) {
    return <div className="p-8 max-w-4xl mx-auto"><Skeleton className="h-96 w-full" /></div>
  }

  if (lesson === null) {
    return (
      <div className="p-8 flex flex-col items-center gap-4">
        <p>Lesson not found</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 1. Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <LessonDialog 
             curriculumId={lesson.curriculumId} 
             lesson={lesson} 
        />
      </div>

      {/* 2. Title & Context */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Lesson Content</Badge>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-xl text-muted-foreground">{lesson.description}</p>
        )}
      </div>

      {/* 3. The Content Area */}
      <Card>
        <CardContent className="p-8 prose dark:prose-invert max-w-none">
          {lesson.content ? (
            <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
              <FileText className="h-16 w-16 mb-4" />
              <p>No text content available for this lesson.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}