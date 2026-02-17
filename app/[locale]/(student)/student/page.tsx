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
import { LogOut, History, Calendar as CalendarIcon, Settings, BellRing, BookOpen, GraduationCap, TrendingUp, Menu, X } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { enUS, es, ptBR } from "date-fns/locale"
import { SignOutButton } from "@clerk/nextjs"
import { StudentScheduleEvent } from "@/lib/types/student"
import { ModeToggle } from "@/components/mode-toggle"
import { LangToggle } from "@/components/lang-toggle"
import { StudentProfileHero } from "@/components/student/student-profile-hero"
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
import { cn } from "@/lib/utils"

export default function StudentHubPage() {
  const t = useTranslations()
  const locale = useLocale()
  const { user } = useUser()
  const currentDateLocale = locale === 'es' ? es : locale === 'pt-BR' ? ptBR : enUS
  
  const [isDragging, setIsDragging] = useState(false)
  const [draggedLesson, setDraggedLesson] = useState<StudentScheduleEvent | null>(null)
  const [activeLesson, setActiveLesson] = useState<StudentScheduleEvent | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)

  const upcomingScrollRef = useRef<HTMLDivElement>(null)
  const pastScrollRef = useRef<HTMLDivElement>(null)

  const [notifiedLessons, setNotifiedLessons] = useState<Set<string>>(new Set())

  // Queries
  const events = useQuery(api.schedule.getMySchedule, {})
  const dashboardData = useQuery(api.student.getStudentDashboardStats)
  
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
    console.log('🎯 Drag Start:', lesson.title)
    setIsDragging(true)
    setDraggedLesson(lesson)
    setSidebarOpen(false)
  }

  const handleDragEnd = () => {
    console.log('🎯 Drag End')
    setIsDragging(false)
    // Don't clear draggedLesson here - we need it for the drop
  }

  const handleDrop = () => {
    console.log('🎯 Drop detected, draggedLesson:', draggedLesson?.title)
    if (draggedLesson) {
      setIsDragging(false)
      setIsLaunching(true)
    }
  }

  // Mobile tap handler - triggers launch animation
  const handleLessonTap = (lesson: StudentScheduleEvent) => {
    console.log('📱 Tap detected:', lesson.title)
    setDraggedLesson(lesson)
    setSidebarOpen(false)
    setIsLaunching(true)
  }

  const handleLaunchComplete = () => {
    console.log('🚀 Launch Complete, setting active lesson:', draggedLesson?.title)
    if (draggedLesson) {
      setIsLaunching(false)
      setActiveLesson(draggedLesson)
      setDraggedLesson(null)
    }
  }

  const handleExitClassroom = () => {
    console.log('👋 Exiting classroom')
    setActiveLesson(null)
    setDraggedLesson(null)
    setIsLaunching(false)
    setIsDragging(false)
  }

  const classStats = dashboardData?.classes
  const studentProfile = dashboardData?.student
  const overallStats = dashboardData?.overall

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Top Bar */}
      <div className="h-16 lg:h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b-4 border-purple-400 dark:border-purple-600 flex items-center justify-between px-4 lg:px-6 shadow-lg flex-shrink-0 z-20">
        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/50"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>

        <FlexidualLogo size="lg" className="hidden sm:block" />
        <FlexidualLogo size="sm" className="sm:hidden" />
        
        <div className="flex items-center gap-2 lg:gap-4">
          <div className="hidden xl:block text-right">
            <p className="text-lg font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {t('student.welcome', { name: user?.firstName || 'Student' })}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              {t('student.welcomeMessage')}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/50 h-9 w-9 lg:h-10 lg:w-10">
                <Settings className="w-4 h-4 lg:w-5 lg:h-5" />
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
          
          <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-2 lg:border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center overflow-hidden">
            {user?.imageUrl ? (
              <Image src={user.imageUrl} alt="avatar" width={56} height={56} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg lg:text-2xl font-bold text-white">{user?.firstName?.charAt(0) || 'S'}</span>
            )}
          </div>

          <SignOutButton>
            <Button variant="ghost" size="icon" className="rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 h-9 w-9 lg:h-10 lg:w-10">
              <LogOut className="w-4 h-4 lg:w-5 lg:h-5" />
            </Button>
          </SignOutButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-0 lg:gap-4 lg:p-4 overflow-hidden min-h-0 relative z-10">
        
        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar - Schedule */}
        <div className={cn(
          "fixed lg:relative z-40 w-80 sm:w-96 lg:w-80 xl:w-96",
          "bg-white/90 dark:bg-gray-900/90 backdrop-blur-md",
          "lg:rounded-3xl border-r-4 lg:border-4 border-purple-400 dark:border-purple-600 shadow-2xl",
          "flex flex-col overflow-hidden flex-shrink-0 transition-transform duration-300",
          "top-16 lg:top-0 bottom-0 lg:inset-y-0 left-0",
          !sidebarOpen && "-translate-x-full lg:translate-x-0"
        )}>
          <Tabs defaultValue="upcoming" className="flex-1 flex flex-col min-h-0">
            <div className="p-3 lg:p-4 border-b-2 border-purple-200 dark:border-purple-800 flex-shrink-0">
              <TabsList className="grid w-full grid-cols-2 bg-purple-100 dark:bg-purple-900/50">
                <TabsTrigger 
                  value="upcoming" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all text-xs sm:text-sm"
                  onClick={() => setSidebarOpen(true)}
                >
                  <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('student.upcoming')}</span>
                  <span className="sm:hidden">Up</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="past" 
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-gray-500 data-[state=active]:to-gray-600 data-[state=active]:text-white transition-all text-xs sm:text-sm"
                  onClick={() => setSidebarOpen(true)}
                >
                  <History className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('student.history')}</span>
                  <span className="sm:hidden">Past</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="upcoming" className="flex-1 min-h-0 m-0 relative">
              <div ref={upcomingScrollRef} className="h-full overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 scrollbar-hide">
                {upcomingLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 lg:p-8 opacity-70">
                    <div className="text-4xl lg:text-6xl mb-3 lg:mb-4 animate-bounce">🎉</div>
                    <h3 className="text-xl lg:text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">{t('student.noUpcoming')}</h3>
                    <p className="text-sm lg:text-base text-gray-500">{t('student.enjoyFreeTime')}</p>
                  </div>
                ) : (
                  upcomingLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTap={handleLessonTap}
                    />
                  ))
                )}
              </div>
              <ScrollIndicator containerRef={upcomingScrollRef} />
            </TabsContent>

            <TabsContent value="past" className="flex-1 min-h-0 m-0 relative">
              <div ref={pastScrollRef} className="h-full overflow-y-auto p-3 lg:p-4 space-y-3 lg:space-y-4 scrollbar-hide">
                {pastLessons.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 lg:p-8 opacity-70">
                    <div className="text-4xl lg:text-6xl mb-3 lg:mb-4">📚</div>
                    <h3 className="text-xl lg:text-2xl font-bold text-gray-600 dark:text-gray-400 mb-2">{t('student.noPast')}</h3>
                  </div>
                ) : (
                  pastLessons.map((lesson) => (
                    <DraggableLessonCard
                      key={lesson.scheduleId}
                      lesson={lesson}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onTap={handleLessonTap}
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
          {!isDragging && !activeLesson && !isLaunching && (
            <div className="absolute inset-0 p-2 sm:p-3 lg:p-2 overflow-y-auto scrollbar-student">
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6 pb-16 lg:pb-20">
                {studentProfile && overallStats && (
                    <StudentProfileHero 
                        student={studentProfile}
                        stats={overallStats}
                    />
                )}

                <div className="col-span-full mt-2 lg:mt-4 flex items-center justify-between px-2">
                    <h2 className="text-xl sm:text-2xl font-black text-gray-800 dark:text-white flex items-center gap-2 lg:gap-3">
                      <GraduationCap className="w-5 h-5 lg:w-6 lg:h-6 text-purple-600 dark:text-purple-400" />
                      {t('student.myClasses')}
                    </h2>
                </div>

                {classStats?.map((stat) => (
                  <Card key={stat.classId} className="group overflow-hidden border-2 hover:border-purple-400 dark:hover:border-purple-600 transition-all duration-300 hover:shadow-xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                    {/* Header with Color Accent */}
                    <div className="h-2 w-full bg-gradient-to-r from-purple-500 to-pink-500" />
                    
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 p-3 sm:p-4 lg:p-6">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
                          {stat.curriculumTitle}
                        </p>
                        
                        <CardTitle className="text-base sm:text-lg font-bold line-clamp-1 text-gray-900 dark:text-gray-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                          {stat.className}
                        </CardTitle>

                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">
                          {stat.description || t('common.noDescription')}
                        </p>
                      </div>
                      
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center ml-2 border-2 border-white dark:border-gray-700 shadow-sm shrink-0">
                        <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 sm:space-y-6 pt-2 sm:pt-4 p-3 sm:p-4 lg:p-6">
                      {/* Teacher Info */}
                      <div className="flex items-center gap-2 sm:gap-3 bg-gray-50 dark:bg-gray-800/50 p-2 sm:p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                        {stat.teacher.imageUrl ? (
                          <Image 
                            src={stat.teacher.imageUrl} 
                            alt={stat.teacher.fullName} 
                            width={48} 
                            height={48} 
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold border-2 border-white dark:border-gray-700 text-sm">
                             {stat.teacher.fullName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('common.teacher')}</p>
                          <p className="font-medium text-xs sm:text-sm truncate">{stat.teacher.fullName}</p>
                        </div>
                      </div>

                      {/* Stats & Progress */}
                      <div className="space-y-2 sm:space-y-3">
                         <div className="flex justify-between items-end text-xs sm:text-sm">
                            <span className="flex items-center gap-1 sm:gap-2 font-semibold text-gray-700 dark:text-gray-300">
                               <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                               <span className="text-xs sm:text-sm">{t('student.attendance')}</span>
                            </span>
                            <span className="font-bold text-purple-600 dark:text-purple-400 text-base sm:text-lg">
                               {stat.stats.progressPercentage}%
                            </span>
                         </div>
                         <Progress value={stat.stats.progressPercentage} className="h-2 sm:h-3 bg-gray-200 dark:bg-gray-700" />
                         <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                            <span>{stat.stats.attendedClasses} {t('student.attended')}</span>
                            <span>{stat.stats.totalClasses} {t('student.totalScheduled')}</span>
                         </div>
                      </div>

                      {/* Next Session */}
                      {stat.nextSession && (
                        <div className="pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
                            <p className="text-[10px] sm:text-xs text-center text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-900/20 py-1 rounded-md capitalize">
                                {t('student.nextClass')}: {format(stat.nextSession, "EEE, MMM d @ h:mm a", { locale: currentDateLocale })}
                            </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Empty State if no classes */}
                {classStats?.length === 0 && (
                  <div className="col-span-full h-48 sm:h-64 flex flex-col items-center justify-center text-gray-400 border-4 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl sm:rounded-3xl">
                     <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 mb-3 sm:mb-4 opacity-50" />
                     <p className="text-lg sm:text-xl font-medium px-4 text-center">{t('student.noClassesEnrolled')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(isDragging || isLaunching || activeLesson) && (
            <div className="absolute inset-0 z-50">
                <ClassroomDropZone
                    isDragging={isDragging}
                    isLaunching={isLaunching}
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