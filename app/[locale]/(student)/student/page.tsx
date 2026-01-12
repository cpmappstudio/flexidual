"use client"

import { useState, useMemo, useRef } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useUser } from "@clerk/nextjs"
import { DraggableLessonCard } from "@/components/student/draggable-lesson-card"
import { ClassroomDropZone } from "@/components/student/classroom-drop-zone"
import { ScrollIndicator } from "@/components/student/scroll-indicator"
import { FlexidualLogo } from "@/components/ui/flexidual-logo"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogOut, History, Calendar as CalendarIcon, Settings } from "lucide-react"
import { useTranslations } from "next-intl"
import { SignOutButton } from "@clerk/nextjs"
import { StudentScheduleEvent } from "@/lib/types/student"
import { ModeToggle } from "@/components/mode-toggle"
import { LangToggle } from "@/components/lang-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import Image from "next/image"

export default function StudentHubPage() {
  const t = useTranslations()
  const { user } = useUser()
  
  const [isDragging, setIsDragging] = useState(false)
  const [draggedLesson, setDraggedLesson] = useState<StudentScheduleEvent | null>(null)
  const [activeLesson, setActiveLesson] = useState<StudentScheduleEvent | null>(null)

  const upcomingScrollRef = useRef<HTMLDivElement>(null)
  const pastScrollRef = useRef<HTMLDivElement>(null)

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
      setActiveLesson(draggedLesson)
    }
  }

  const handleLaunchComplete = () => {
    setDraggedLesson(null)
  }

  const handleExitClassroom = () => {
    setActiveLesson(null)
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Top Bar */}
      <div className="h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b-4 border-purple-400 dark:border-purple-600 flex items-center justify-between px-6 shadow-lg flex-shrink-0">
        <FlexidualLogo size="lg" />
        
        <div className="flex items-center gap-4">
          <div className="hidden lg:block text-right">
            <p className="text-lg font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {t('student.welcome', { name: user?.firstName || 'Student' })}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              {t('student.welcomeMessage')}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Settings className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('common.theme')}</DropdownMenuLabel>
              <div className="px-2 py-1">
                <ModeToggle showText={true} />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
              <div className="px-2 py-1">
                <LangToggle showText={true} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center overflow-hidden">
            {user?.imageUrl ? (
              <Image 
                src={user.imageUrl} 
                alt="avatar" 
                width={56}
                height={56}
                className="w-full h-full object-cover" 
              />
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
      <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <div className="w-96 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-3xl border-4 border-purple-400 dark:border-purple-600 shadow-2xl flex flex-col overflow-hidden flex-shrink-0">
          <Tabs defaultValue="upcoming" className="flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b-2 border-purple-200 dark:border-purple-800 flex-shrink-0">
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

            <TabsContent value="upcoming" className="flex-1 min-h-0 m-0 relative">
              <div ref={upcomingScrollRef} className="h-full overflow-y-auto p-4 space-y-4 scrollbar-hide">
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
              </div>
              <ScrollIndicator containerRef={upcomingScrollRef} />
            </TabsContent>

            <TabsContent value="past" className="flex-1 min-h-0 m-0 relative">
              <div ref={pastScrollRef} className="h-full overflow-y-auto p-4 space-y-4 scrollbar-hide">
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
              </div>
              <ScrollIndicator containerRef={pastScrollRef} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right - Classroom Drop Zone */}
        <div className="flex-1 relative min-w-0">
          <ClassroomDropZone
            isDragging={isDragging}
            activeLesson={activeLesson}
            onDrop={handleDrop}
            onLaunchComplete={handleLaunchComplete}
            onLeaveClassroom={handleExitClassroom}
          />

          {/* {activeLesson && (
            <Button
              onClick={handleExitClassroom}
              className="absolute top-4 right-4 z-50 bg-red-500 hover:bg-red-600 text-white shadow-2xl rounded-full"
              size="lg"
            >
              <LogOut className="w-5 h-5 mr-2" />
              {t('classroom.leave')}
            </Button>
          )} */}
        </div>
      </div>
    </div>
  )
}