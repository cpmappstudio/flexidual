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
import { useTranslations } from "next-intl"

export default function LessonReaderPage() {
  const t = useTranslations()
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
        <p>{t('lesson.notFound')}</p>
        <Button variant="outline" onClick={() => router.back()}>{t('common.back')}</Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
        </Button>
        <LessonDialog 
             curriculumId={lesson.curriculumId} 
             lesson={lesson} 
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t('lesson.contentBadge')}</Badge>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{lesson.title}</h1>
        {lesson.description && (
          <p className="text-xl text-muted-foreground">{lesson.description}</p>
        )}
      </div>

      <Card>
        <CardContent className="p-8 prose dark:prose-invert max-w-none">
          {lesson.content ? (
            <div dangerouslySetInnerHTML={{ __html: lesson.content }} />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
              <FileText className="h-16 w-16 mb-4" />
              <p>{t('lesson.noContent')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}