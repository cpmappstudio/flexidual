"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

export default function LessonViewerPage() {
  const params = useParams()
  const lessonId = params.lessonId as Id<"lessons">
  
  const lesson = useQuery(api.lessons.get, { id: lessonId })

  if (lesson === undefined) {
    return <div className="p-8 max-w-4xl mx-auto"><Skeleton className="h-96 w-full" /></div>
  }

  if (lesson === null) {
    return <div className="p-8">Lesson not found</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* 1. Navigation Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      {/* 2. Lesson Title & Meta */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-6">Lesson</Badge>
          {/* You could add a "Completed" badge here for students later */}
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-xl text-muted-foreground">{lesson.description}</p>
        )}
      </div>

      {/* 3. The Content (HTML/Rich Text) */}
      <Card>
        <CardContent className="p-8 prose dark:prose-invert max-w-none">
          {lesson.content ? (
            <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-20" />
              <p>No content has been added to this lesson yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Resources List (If you added resources back to schema later) */}
      {/* <div className="space-y-4">
        <h3 className="text-lg font-semibold">Resources</h3>
        ... map resources here ...
      </div> */}
    </div>
  )
}