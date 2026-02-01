"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { useParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { CheckCircle2, ArrowRight, Calendar as CalendarIcon, BookOpen, Plus, MonitorPlay, Video } from "lucide-react"
import { ManageScheduleDialog } from "@/components/teaching/classes/manage-schedule-dialog"
import { StudentManager } from "@/components/teaching/classes/student-manager"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { StudentScheduleEvent } from "@/lib/types/student"

export default function ClassDetailPage() {
  const t = useTranslations()
  const params = useParams()
  const classId = params.classId as Id<"classes">
  const [scheduleView, setScheduleView] = useState<"lessons" | "calendar">("lessons")

  const classData = useQuery(api.classes.get, { id: classId })
  
  const lessons = useQuery(api.lessons.listByCurriculum, 
    classData ? { curriculumId: classData.curriculumId } : "skip"
  )

  const allScheduleItems = useQuery(api.schedule.getMySchedule, {})
  const classSchedule = allScheduleItems?.filter(s => s.classId === classId)
    .sort((a, b) => a.start - b.start)

  if (classData === undefined || lessons === undefined || allScheduleItems === undefined) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  if (!classData) return <div className="p-6">{t('class.notFound')}</div>

  // Group schedules by lesson vs non-lesson
  const lessonSchedules = classSchedule?.filter(s => s.lessonId) || []

  // Get upcoming and past schedules
  const now = Date.now()
  const upcomingSchedules = classSchedule?.filter(s => s.start >= now) || []
  const pastSchedules = classSchedule?.filter(s => s.start < now) || []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{classData.name}</h1>
          <p className="text-muted-foreground">
            {t('curriculum.title')}: <span className="font-medium text-foreground">{classData.curriculumTitle}</span>
          </p>
        </div>
        
        {/* Quick Stats */}
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold">{classData.students.length}</div>
            <div className="text-muted-foreground">{t('navigation.students')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{upcomingSchedules.length}</div>
            <div className="text-muted-foreground">{t('schedule.upcoming')}</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList>
          <TabsTrigger value="schedule">{t('class.schedule')}</TabsTrigger>
          <TabsTrigger value="students">{t('navigation.students')} ({classData.students.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          {/* Schedule View Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={scheduleView === "lessons" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleView("lessons")}
              >
                <BookOpen className="h-4 w-4 mr-2" />
                {t('class.byLessons')}
              </Button>
              <Button
                variant={scheduleView === "calendar" ? "default" : "outline"}
                size="sm"
                onClick={() => setScheduleView("calendar")}
              >
                <CalendarIcon className="h-4 w-4 mr-2" />
                {t('class.allSchedules')}
              </Button>
            </div>

            {/* Replaced CreateScheduleDialog with ManageScheduleDialog */}
            <ManageScheduleDialog 
              classId={classId}
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('schedule.create')}
                </Button>
              }
            />
          </div>

          {/* LESSONS VIEW: Curriculum-based lesson scheduling */}
          {scheduleView === "lessons" && (
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
                    const scheduledItem = lessonSchedules.find(s => s.lessonId === lesson._id)
                    const isIgnitia = scheduledItem?.sessionType === "ignitia"
                    
                    return (
                      <div key={lesson._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
                            isIgnitia 
                                ? "bg-orange-100 text-orange-700" 
                                : "bg-primary/10 text-primary"
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                                <p className="font-medium">{lesson.title}</p>
                                {isIgnitia && (
                                    <Badge variant="outline" className="text-[10px] h-5 px-1 text-orange-600 border-orange-200 bg-orange-50">
                                        Ignitia
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-1">{lesson.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 ml-12 sm:ml-0">
                          {scheduledItem ? (
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className={`flex items-center justify-end gap-1.5 text-sm font-medium ${
                                    isIgnitia ? "text-orange-600" : "text-green-600"
                                }`}>
                                  <CheckCircle2 className="h-4 w-4" />
                                  {t('lesson.scheduled')}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {format(scheduledItem.start, "MMM d, h:mm a")}
                                </p>
                              </div>
                              
                              {/* Replaced ScheduleLessonDialog with ManageScheduleDialog (Edit Mode) */}
                              <ManageScheduleDialog 
                                classId={classId}
                                scheduleId={scheduledItem.scheduleId}
                                initialData={{
                                    lessonId: lesson._id,
                                    title: scheduledItem.title,
                                    description: scheduledItem.description,
                                    start: scheduledItem.start,
                                    end: scheduledItem.end,
                                    sessionType: scheduledItem.sessionType || "live"
                                }}
                              />

                              {/* BUTTON LOGIC SPLIT */}
                              {scheduledItem.isLive ? (
                                <Button size="sm" 
                                    variant={isIgnitia ? "default" : "destructive"} 
                                    className={isIgnitia ? "bg-orange-600 hover:bg-orange-700" : ""}
                                    asChild
                                >
                                  <Link href={`/classroom/${scheduledItem.roomName}`}>
                                    {isIgnitia ? "Open Active Session" : t('classroom.joinLive')}
                                  </Link>
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={`/classroom/${scheduledItem.roomName}`}>
                                    {isIgnitia ? (
                                        <>
                                            <MonitorPlay className="mr-2 h-4 w-4 text-orange-600" />
                                            Open Ignitia
                                        </>
                                    ) : (
                                        <>
                                            {t('classroom.prepareRoom')}
                                            <ArrowRight className="ml-2 h-4 w-4" />
                                        </>
                                    )}
                                  </Link>
                                </Button>
                              )}
                            </div>
                          ) : (
                            // Replaced ScheduleLessonDialog with ManageScheduleDialog (Create Mode)
                            <ManageScheduleDialog 
                                classId={classId}
                                preselectedLessonId={lesson._id}
                                trigger={<Button size="sm" variant="outline">{t('class.schedule')}</Button>}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CALENDAR VIEW: All schedules chronologically */}
          {scheduleView === "calendar" && (
            <div className="space-y-6">
              {/* Upcoming Sessions */}
              {upcomingSchedules.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('schedule.upcoming')}</CardTitle>
                    <CardDescription>
                      {upcomingSchedules.length} {t('schedule.upcomingSessions')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {upcomingSchedules.map((schedule) => (
                        <ScheduleItem key={schedule.scheduleId} schedule={schedule} classId={classId} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Past Sessions */}
              {pastSchedules.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('schedule.past')}</CardTitle>
                    <CardDescription>
                      {pastSchedules.length} {t('schedule.pastSessions')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {pastSchedules.slice(0, 10).map((schedule) => (
                        <ScheduleItem key={schedule.scheduleId} schedule={schedule} classId={classId} isPast />
                      ))}
                      {pastSchedules.length > 10 && (
                        <p className="text-sm text-muted-foreground text-center pt-2">
                          {t('schedule.andMore', { count: pastSchedules.length - 10 })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {upcomingSchedules.length === 0 && pastSchedules.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <CalendarIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t('schedule.noSchedules')}</h3>
                    <p className="text-muted-foreground mb-4 max-w-sm">
                      {t('schedule.createPrompt')}
                    </p>
                    <ManageScheduleDialog classId={classId} />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <StudentManager classId={classId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Reusable Schedule Item Component
function ScheduleItem({ 
  schedule, 
  classId, 
  isPast = false 
}: { 
  schedule: StudentScheduleEvent & { 
    scheduleId: Id<"classSchedule">
    lessonId?: Id<"lessons">
    description?: string
    roomName: string
    sessionType?: "live" | "ignitia"
  }
  classId: Id<"classes">
  isPast?: boolean 
}) {
  const t = useTranslations()
  const isIgnitia = schedule.sessionType === "ignitia";
  
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4 ${isPast ? 'opacity-60' : ''} ${isIgnitia ? 'bg-orange-50/30 border-orange-100' : ''}`}>
      <div className="flex items-start gap-4 flex-1">
        {/* Date Badge */}
        <div className={`flex flex-col items-center justify-center min-w-[60px] text-center p-2 rounded-md ${
            isIgnitia ? "bg-orange-100 text-orange-900" : "bg-muted"
        }`}>
          <span className="text-xs font-bold uppercase opacity-70">
            {format(schedule.start, "MMM")}
          </span>
          <span className="text-xl font-bold">
            {format(schedule.start, "d")}
          </span>
          <span className="text-xs opacity-70">
            {format(schedule.start, "h:mm a")}
          </span>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium">{schedule.title}</h4>
            
            {/* Session Type Badge */}
            {isIgnitia ? (
                 <Badge variant="outline" className="shrink-0 text-orange-700 bg-orange-100 border-orange-200">
                    <MonitorPlay className="h-3 w-3 mr-1" />
                    Ignitia
                </Badge>
            ) : (
                <Badge variant="secondary" className="shrink-0">
                    <Video className="h-3 w-3 mr-1" />
                    Live Class
                </Badge>
            )}

            {schedule.lessonId && (
              <Badge variant="outline" className="shrink-0">
                <BookOpen className="h-3 w-3 mr-1" />
                {t('lesson.linked')}
              </Badge>
            )}
            
            {/* Active Status */}
            {schedule.isLive && (
              isIgnitia ? (
                <Badge className="shrink-0 bg-orange-500">Active</Badge>
              ) : (
                <Badge variant="destructive" className="animate-pulse shrink-0">
                    {t('common.live')}
                </Badge>
              )
            )}
            
            {schedule.status === "cancelled" && (
              <Badge variant="secondary" className="shrink-0">
                {t('common.cancelled')}
              </Badge>
            )}
            {schedule.status === "completed" && (
              <Badge variant="secondary" className="shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t('common.completed')}
              </Badge>
            )}
          </div>
          {schedule.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
              {schedule.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {format(schedule.start, "EEEE, MMMM d, yyyy 'at' h:mm a")} - {format(schedule.end, "h:mm a")}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!isPast && schedule.status !== "cancelled" && (
          <>
            {/* Unified Manage Dialog */}
            <ManageScheduleDialog 
              classId={classId}
              scheduleId={schedule.scheduleId}
              initialData={{
                lessonId: schedule.lessonId, 
                title: schedule.title,
                description: schedule.description,
                start: schedule.start,
                end: schedule.end,
                sessionType: schedule.sessionType || "live"
              }}
              trigger={<Button size="sm" variant="outline">{t('common.edit')}</Button>}
            />
            
            {/* Button Logic Split */}
            {schedule.isLive ? (
              <Button size="sm" 
                variant={isIgnitia ? "default" : "destructive"} 
                className={isIgnitia ? "bg-orange-600 hover:bg-orange-700" : ""}
                asChild
              >
                <Link href={`/classroom/${schedule.roomName}`}>
                  {isIgnitia ? "Open Session" : t('classroom.joinLive')}
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/classroom/${schedule.roomName}`}>
                   {isIgnitia ? (
                      <>
                        <MonitorPlay className="mr-2 h-4 w-4 text-orange-600" />
                        Open Ignitia
                      </>
                   ) : (
                      <>
                        {t('classroom.prepareRoom')}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                   )}
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}