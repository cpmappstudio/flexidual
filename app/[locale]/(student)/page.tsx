"use client"

import { useState, useMemo } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useUser } from "@clerk/nextjs"
import { DraggableLessonCard } from "@/components/student/draggable-lesson-card"
import { ClassroomDropZone } from "@/components/student/classroom-drop-zone"
import { RocketTransition } from "@/components/student/rocket-transition"
import { FlexidualLogo } from "@/components/ui/flexidual-logo"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogOut, History, Calendar as CalendarIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { SignOutButton } from "@clerk/nextjs"
import { StudentScheduleEvent } from "@/lib/types/student"

export default function StudentHubPage() {
  const t = useTranslations()
  const router = useRouter()
  const { user } = useUser()
  
  const [isDragging, setIsDragging] = useState(false)
  const [draggedLesson, setDraggedLesson] = useState<StudentScheduleEvent | null>(null)
  const [activeLesson, setActiveLesson] = useState<StudentScheduleEvent | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)

  const events = useQuery(api.schedule.getMySchedule, {})

  const now = Date.now()

  const { upcomingLessons, pastLessons } = useMemo(() => {
    if (!events) return { upcomingLessons: [], pastLessons: [] }

    const upcoming = events
      .filter(e => e.end > now)
      .sort((a, b) => a.start - b.start)

    const past = events
      .filter(e => e.end <= now)
      .sort((a, b) => b.start - a.start)
      .slice(0, 20)

    return { upcomingLessons: upcoming, pastLessons: past }
  }, [events, now])

  const handleDragStart = (lesson: StudentScheduleEvent) => {
    setIsDragging(true)
    setDraggedLesson(lesson)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setDraggedLesson(null)
  }

  const handleDrop = () => {
    if (draggedLesson) {
      setIsLaunching(true)
    }
  }

  const handleRocketComplete = () => {
    setActiveLesson(draggedLesson)
    setDraggedLesson(null)
    setIsLaunching(false)
  }

  const handleExitClassroom = () => {
    setActiveLesson(null)
  }

  return (
    <>
      <RocketTransition isLaunching={isLaunching} onComplete={handleRocketComplete} />

      <div className="h-screen w-screen flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b-4 border-purple-400 dark:border-purple-600 flex items-center justify-between px-6 shadow-lg">
          <FlexidualLogo size="lg" />
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold text-gray-500">{t('student.welcome')}</p>
              <p className="text-xl font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {user?.firstName || 'Student'}
              </p>
            </div>
            
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center overflow-hidden">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {user?.firstName?.charAt(0) || '👦'}
                </span>
              )}
            </div>

            <SignOutButton>
              <Button variant="ghost" size="icon" className="rounded-full">
                <LogOut className="w-5 h-5" />
              </Button>
            </SignOutButton>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left Sidebar - Lessons */}
          <div className="w-96 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-3xl border-4 border-purple-400 dark:border-purple-600 shadow-2xl flex flex-col overflow-hidden">
            <Tabs defaultValue="upcoming" className="flex-1 flex flex-col">
              <div className="p-4 border-b-2 border-purple-200 dark:border-purple-800">
                <TabsList className="grid w-full grid-cols-2 bg-purple-100 dark:bg-purple-900">
                  <TabsTrigger value="upcoming" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {t('student.upcoming')}
                  </TabsTrigger>
                  <TabsTrigger value="past" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gray-500 data-[state=active]:to-gray-600 data-[state=active]:text-white">
                    <History className="w-4 h-4 mr-2" />
                    {t('student.history')}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="upcoming" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
                {upcomingLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <div className="text-6xl mb-4">🎉</div>
                    <h3 className="text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">
                      {t('student.noUpcoming')}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-500">
                      {t('student.enjoyFreeTime')}
                    </p>
                  </div>
                ) : (
                  upcomingLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="past" className="flex-1 overflow-y-auto p-4 space-y-4 m-0">
                {pastLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">
                      {t('student.noPast')}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-500">
                      {t('student.historyEmpty')}
                    </p>
                  </div>
                ) : (
                  pastLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isPast
                      isAttended={lesson.status === "completed"}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right - Classroom Drop Zone */}
          <div className="flex-1 relative">
            <ClassroomDropZone
              isDragging={isDragging}
              activeLesson={activeLesson}
              onDrop={handleDrop}
            />

            {activeLesson && (
              <Button
                onClick={handleExitClassroom}
                className="absolute top-4 right-4 z-50 bg-red-500 hover:bg-red-600 text-white shadow-2xl"
                size="lg"
              >
                <LogOut className="w-5 h-5 mr-2" />
                {t('classroom.leave')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}