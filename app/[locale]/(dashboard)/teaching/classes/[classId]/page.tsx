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
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function ClassDetailPage() {
  const params = useParams()
  const classId = params.classId as Id<"classes">

  // 1. Fetch Class Details (using existing api.classes.get)
  const classData = useQuery(api.classes.get, { id: classId })

  // 2. Fetch Curriculum Lessons (using existing api.lessons.listByCurriculum)
  const lessons = useQuery(api.lessons.listByCurriculum, 
    classData ? { curriculumId: classData.curriculumId } : "skip"
  )

  // 3. Fetch Schedule for this class
  // We use getMySchedule, which returns all classes, then filter for this one.
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

  if (!classData) return <div className="p-6">Class not found</div>

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{classData.name}</h1>
        <p className="text-muted-foreground">
          Curriculum: <span className="font-medium text-foreground">{classData.curriculumTitle}</span>
        </p>
      </div>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList>
          <TabsTrigger value="schedule">Lesson Plan & Schedule</TabsTrigger>
          <TabsTrigger value="students">Students ({classData.students.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Roadmap</CardTitle>
              <CardDescription>Schedule your lessons to make them available to students.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lessons.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    No lessons found in this curriculum.
                  </div>
                )}

                {lessons.map((lesson, index) => {
                  // Find if this specific lesson is scheduled
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
                                Scheduled
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {format(scheduledItem.start, "MMM d, h:mm a")}
                              </p>
                            </div>
                            
                            {scheduledItem.isLive ? (
                               <Button size="sm" variant="destructive" asChild>
                                 <Link href={`/classroom/${scheduledItem.roomName}`}>Join Live</Link>
                               </Button>
                            ) : (
                               <Button size="sm" variant="outline" asChild>
                                 <Link href={`/classroom/${scheduledItem.roomName}`}>
                                   Prepare Room
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

        <TabsContent value="students">
          <Card>
            <CardHeader>
              <CardTitle>Enrolled Students</CardTitle>
            </CardHeader>
            <CardContent>
               <p className="text-muted-foreground">
                 Student management list will go here.
                 (You can use <code>api.classes.getStudents</code> here later)
               </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}