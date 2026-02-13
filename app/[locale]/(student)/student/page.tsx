"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useUser } from "@clerk/nextjs"
import { DraggableLessonCard } from "@/components/student/draggable-lesson-card"
import { ClassroomDropZone } from "@/components/student/classroom-drop-zone"
import { ScrollIndicator } from "@/components/student/scroll-indicator"
import { FlexidualLogo } from "@/components/ui/flexidual-logo"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogOut, History, Calendar as CalendarIcon, Settings, BellRing, BookOpen, GraduationCap, TrendingUp } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { enUS, es, ptBR } from "date-fns/locale"
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
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format } from "date-fns"

export default function StudentHubPage() {
  const t = useTranslations()
  const locale = useLocale()
  const { user } = useUser()
  const currentDateLocale = locale === 'es' ? es : locale === 'pt-BR' ? ptBR : enUS
  
  const [isDragging, setIsDragging] = useState(false)
  const [draggedLesson, setDraggedLesson] = useState<StudentScheduleEvent | null>(null)
  const [activeLesson, setActiveLesson] = useState<StudentScheduleEvent | null>(null)

  const upcomingScrollRef = useRef<HTMLDivElement>(null)
  const pastScrollRef = useRef<HTMLDivElement>(null)

  const [notifiedLessons, setNotifiedLessons] = useState<Set<string>>(new Set())

  // Queries
  const events = useQuery(api.schedule.getMySchedule, {})
  const classStats = useQuery(api.student.getStudentDashboardStats)
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

  // Notification System
  useEffect(() => {
    if (upcomingLessons.length === 0) return;

    const checkNotifications = () => {
        const currentTime = Date.now();
        upcomingLessons.forEach(lesson => {
            const timeDiff = lesson.start - currentTime;
            const minutesLeft = timeDiff / 60000;

            if (minutesLeft <= 5 && minutesLeft > 0 && !notifiedLessons.has(lesson.scheduleId)) {
                toast(t('schedule.classStartingSoon'), {
                    description: `${lesson.title} starts in 5 minutes!`,
                    icon: <BellRing className="w-5 h-5 text-orange-500 animate-bounce" />,
                    duration: 10000,
                    action: {
                        label: "Go",
                        onClick: () => {}
                    }
                });
                setNotifiedLessons(prev => new Set(prev).add(lesson.scheduleId));
            }
        });
    };
    const interval = setInterval(checkNotifications, 15000);
    return () => clearInterval(interval);
  }, [upcomingLessons, notifiedLessons, t]);

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

  const handleLaunchComplete = () => setDraggedLesson(null)
  const handleExitClassroom = () => setActiveLesson(null)

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Top Bar */}
      <div className="h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b-4 border-purple-400 dark:border-purple-600 flex items-center justify-between px-6 shadow-lg flex-shrink-0 z-20">
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
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/50">
                <Settings className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('common.theme')}</DropdownMenuLabel>
              <div className="px-2 py-1"><ModeToggle showText={true} /></div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
              <div className="px-2 py-1"><LangToggle showText={true} /></div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center overflow-hidden">
            {user?.imageUrl ? (
              <Image src={user.imageUrl} alt="avatar" width={56} height={56} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-white">{user?.firstName?.charAt(0) || 'SD'}</span>
            )}
          </div>

          <SignOutButton>
            <Button variant="ghost" size="icon" className="rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <LogOut className="w-5 h-5" />
            </Button>
          </SignOutButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0 relative z-10">
        
        {/* Left Sidebar - Schedule */}
        <div className="w-96 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-3xl border-4 border-purple-400 dark:border-purple-600 shadow-2xl flex flex-col overflow-hidden flex-shrink-0 transition-all duration-300">
          <Tabs defaultValue="upcoming" className="flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b-2 border-purple-200 dark:border-purple-800 flex-shrink-0">
              <TabsList className="grid w-full grid-cols-2 bg-purple-100 dark:bg-purple-900/50">
                <TabsTrigger value="upcoming" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {t('student.upcoming')}
                </TabsTrigger>
                <TabsTrigger value="past" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gray-500 data-[state=active]:to-gray-600 data-[state=active]:text-white transition-all">
                  <History className="w-4 h-4 mr-2" />
                  {t('student.history')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="upcoming" className="flex-1 min-h-0 m-0 relative">
              <div ref={upcomingScrollRef} className="h-full overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {upcomingLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-70">
                    <div className="text-6xl mb-4 animate-bounce">🎉</div>
                    <h3 className="text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">{t('student.noUpcoming')}</h3>
                    <p className="text-gray-500">{t('student.enjoyFreeTime')}</p>
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
                  <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-70">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">{t('student.noPast')}</h3>
                  </div>
                ) : (
                  pastLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isPast
                    />
                  ))
                )}
              </div>
              <ScrollIndicator containerRef={pastScrollRef} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Area - Dynamic: Dashboard Grid OR Drop Zone */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          {/* Layer 1: Dashboard Stats 
              Visible only when NOT dragging and NOT in active lesson.
              We use absolute positioning to overlap, but simple conditional is cleaner for this logic.
          */}
          {!isDragging && !activeLesson && (
            <div className="absolute inset-0 p-2 overflow-y-auto scrollbar-student">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-3xl font-black text-gray-800 dark:text-white flex items-center gap-3">
                  <GraduationCap className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                  {t('student.myClasses')}
                </h2>
                <div className="px-4 py-2 bg-white/60 dark:bg-gray-800/60 rounded-full border border-purple-200 dark:border-purple-800 text-sm font-medium text-purple-700 dark:text-purple-300 shadow-sm backdrop-blur-sm">
                   {classStats?.length || 0} {t('student.activeCourses')}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-20">
                {classStats?.map((stat) => (
                  <Card key={stat.classId} className="group overflow-hidden border-2 hover:border-purple-400 dark:hover:border-purple-600 transition-all duration-300 hover:shadow-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                    {/* Header with Color Accent */}
                    <div className="h-2 w-full bg-gradient-to-r from-purple-500 to-pink-500" />
                    
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
                          {stat.curriculumTitle}
                        </p>
                        
                        <CardTitle className="text-lg font-bold line-clamp-1 text-gray-900 dark:text-gray-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                          {stat.className}
                        </CardTitle>

                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {stat.description || t('common.noDescription')}
                        </p>
                      </div>
                      
                      <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center ml-2 border-2 border-white dark:border-gray-700 shadow-sm shrink-0">
                        <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-6 pt-4">
                      {/* Teacher Info */}
                      <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                        {stat.teacher.imageUrl ? (
                          <Image 
                            src={stat.teacher.imageUrl} 
                            alt={stat.teacher.fullName} 
                            width={48} 
                            height={48} 
                            className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold border-2 border-white dark:border-gray-700">
                             {stat.teacher.fullName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.teacher')}</p>
                          <p className="font-medium text-sm">{stat.teacher.fullName}</p>
                        </div>
                      </div>

                      {/* Stats & Progress */}
                      <div className="space-y-3">
                         <div className="flex justify-between items-end text-sm">
                            <span className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300">
                               <TrendingUp className="w-4 h-4 text-green-500" />
                               {t('student.attendance')}
                            </span>
                            <span className="font-bold text-purple-600 dark:text-purple-400 text-lg">
                               {stat.stats.progressPercentage}%
                            </span>
                         </div>
                         <Progress value={stat.stats.progressPercentage} className="h-3 bg-gray-200 dark:bg-gray-700" />
                         <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{stat.stats.attendedClasses} {t('student.attended')}</span>
                            <span>{stat.stats.totalClasses} {t('student.totalScheduled')}</span>
                         </div>
                      </div>

                      {/* Next Session */}
                      {stat.nextSession && (
                        <div className="pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-center text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-900/20 py-1 rounded-md capitalize">
                                {t('student.nextClass')}: {format(stat.nextSession, "EEEE, MMM d @ h:mm a", { locale: currentDateLocale })}
                            </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Empty State if no classes */}
                {classStats?.length === 0 && (
                  <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-400 border-4 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl">
                     <BookOpen className="w-16 h-16 mb-4 opacity-50" />
                     <p className="text-xl font-medium">{t('student.noClassesEnrolled')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Layer 2: Drop Zone / Active Classroom 
              This component handles the "Dropping" logic and the "Active Class" view.
              We ensure it's rendered when needed.
              (Assuming ClassroomDropZone handles its own visibility based on props or we control it via wrapper)
          */}
          {(isDragging || activeLesson) && (
            <div className="absolute inset-0 z-50">
                <ClassroomDropZone
                    isDragging={isDragging}
                    activeLesson={activeLesson}
                    onDrop={handleDrop}
                    onLaunchComplete={handleLaunchComplete}
                    onLeaveClassroom={handleExitClassroom}
                />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}