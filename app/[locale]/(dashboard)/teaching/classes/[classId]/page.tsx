"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { CheckCircle2, ArrowRight } from "lucide-react"
import { ScheduleLessonDialog } from "@/components/teaching/classes/schedule-lesson-dialog"
import { StudentManager } from "@/components/teaching/classes/student-manager"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"

export default function ClassDetailPage() {
  const t = useTranslations()
  const params = useParams()
  const classId = params.classId as Id<"classes">

  const classData = useQuery(api.classes.get, { id: classId })
  
  const lessons = useQuery(api.lessons.listByCurriculum, 
    classData ? { curriculumId: classData.curriculumId } : "skip"
  )

  const allScheduleItems = useQuery(api.schedule.getMySchedule, {})
  const classSchedule = allScheduleItems?.filter(s => s.classId === classId)

  if (classData === undefined || lessons === undefined || allScheduleItems === undefined) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!classData) return <div className="p-6">{t('class.notFound')}</div>

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{classData.name}</h1>
        <p className="text-muted-foreground">
          {t('curriculum.title')}: <span className="font-medium text-foreground">{classData.curriculumTitle}</span>
        </p>
      </div>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList>
          <TabsTrigger value="schedule">{t('class.lessonPlan')}</TabsTrigger>
          <TabsTrigger value="students">{t('navigation.students')} ({classData.students.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('class.courseRoadmap')}</CardTitle>
              <CardDescription>{t('class.schedulePrompt')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lessons.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    {t('class.noCurriculumLessons')}
                  </div>
                )}

                {lessons.map((lesson, index) => {
                  const scheduledItem = classSchedule?.find(s => s.lessonId === lesson._id)
                  
                  return (
                    <div key={lesson._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4">
                      <div className="flex items-start gap-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{lesson.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">{lesson.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-12 sm:ml-0">
                        {scheduledItem ? (
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="flex items-center justify-end gap-1.5 text-sm font-medium text-green-600">
                                <CheckCircle2 className="h-4 w-4" />
                                {t('lesson.scheduled')}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {format(scheduledItem.start, "MMM d, h:mm a")}
                              </p>
                            </div>
                            
                            {/* NEW: Edit Button (Reusing Dialog) */}
                            <ScheduleLessonDialog 
                                classId={classId}
                                lessonId={lesson._id}
                                lessonTitle={lesson.title}
                                scheduleId={scheduledItem.scheduleId}
                                initialStart={scheduledItem.start}
                                initialEnd={scheduledItem.end}
                            />

                            {scheduledItem.isLive ? (
                               <Button size="sm" variant="destructive" asChild>
                                 <Link href={`/classroom/${scheduledItem.roomName}`}>{t('classroom.joinLive')}</Link>
                               </Button>
                            ) : (
                               <Button size="sm" variant="outline" asChild>
                                 <Link href={`/classroom/${scheduledItem.roomName}`}>
                                   {t('classroom.prepareRoom')}
                                   <ArrowRight className="ml-2 h-4 w-4" />
                                 </Link>
                               </Button>
                            )}
                          </div>
                        ) : (
                          <ScheduleLessonDialog 
                            classId={classId} 
                            lessonId={lesson._id} 
                            lessonTitle={lesson.title} 
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students" className="mt-4">
           <StudentManager classId={classId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}