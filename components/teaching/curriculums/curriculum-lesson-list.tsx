"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Plus, GripVertical } from "lucide-react"
import { LessonDialog } from "@/components/teaching/lessons/lesson-dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTranslations } from "next-intl"

interface CurriculumLessonListProps {
  curriculumId: Id<"curriculums">
}

export function CurriculumLessonList({ curriculumId }: CurriculumLessonListProps) {
  const t = useTranslations()
  const lessons = useQuery(api.lessons.listByCurriculum, { curriculumId })

  if (lessons === undefined) {
    return <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
    </div>
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex justify-between items-center">
         <div className="text-sm text-muted-foreground">
            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} in total
         </div>
         {/* TRIGGER NEW LESSON */}
         <LessonDialog 
            curriculumId={curriculumId}
            trigger={
                <Button size="sm" className="gap-2" type="button">
                    <Plus className="h-4 w-4" />
                    {t('common.add')} Lesson
                </Button>
            }
         />
      </div>

      <ScrollArea className="h-[400px] pr-4 border rounded-md bg-muted/10 p-2">
        {lessons.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                <p>No lessons yet.</p>
                <p>Click &ldquo;Add Lesson&rdquo; to create the first one.</p>
             </div>
        ) : (
            <div className="space-y-2">
                {lessons.map((lesson) => (
                    <div 
                        key={lesson._id} 
                        className="group flex items-center gap-3 p-3 bg-card border rounded-lg hover:border-primary/50 transition-all shadow-sm"
                    >
                        {/* Drag Handle Mockup */}
                        <GripVertical className="h-4 w-4 text-muted-foreground/30" />
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium truncate">{lesson.title}</span>
                                {!lesson.isActive && (
                                    <Badge variant="secondary" className="text-[10px] h-5 px-1">Draft</Badge>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                                {lesson.description || "No description"}
                            </div>
                        </div>

                        {/* EDIT TRIGGER */}
                        <LessonDialog 
                            lesson={lesson}
                            curriculumId={curriculumId}
                            trigger={
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" type="button">
                                    <Edit className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            }
                        />
                    </div>
                ))}
            </div>
        )}
      </ScrollArea>
    </div>
  )
}