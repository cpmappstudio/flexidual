"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Video, Calendar as CalendarIcon, Clock, BookOpen, Users, Plus } from "lucide-react"
import Link from "next/link"
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog"
import { useCurrentUser } from "@/hooks/use-current-user"
import { format, isToday, isTomorrow, startOfDay, addDays } from "date-fns"
import { useMemo } from "react"
import { useTranslations } from "next-intl"

export default function TeachingDashboard() {
  const t = useTranslations()
  const curriculums = useQuery(api.curriculums.list, { includeInactive: false })
  const events = useQuery(api.schedule.getMySchedule, {})
  const { user, isLoading } = useCurrentUser()
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"

  const now = Date.now()
  const todayStart = startOfDay(new Date()).getTime()

  // Process events
  const { nextLesson, isLive, todayLessons, upcomingLessons, weekCalendar } = useMemo(() => {
    if (!events) return { 
      nextLesson: null, 
      isLive: false, 
      todayLessons: [], 
      upcomingLessons: [],
      weekCalendar: []
    }

    const next = events.find(e => e.end > now)
    const live = next && next.start <= now && next.end >= now

    const today = events.filter(e => 
      e.start >= todayStart && e.start < todayStart + 86400000
    ).sort((a, b) => a.start - b.start)

    const upcoming = events
      .filter(e => e.start > now && e.start >= todayStart + 86400000)
      .sort((a, b) => a.start - b.start)
      .slice(0, 5)

    // Week calendar
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(new Date(), i)
      const dayStart = startOfDay(date).getTime()
      const dayEnd = dayStart + 86400000
      const dayEvents = events.filter(e => e.start >= dayStart && e.start < dayEnd)
      return {
        date,
        events: dayEvents,
        hasEvents: dayEvents.length > 0
      }
    })

    return { 
      nextLesson: next, 
      isLive: live, 
      todayLessons: today, 
      upcomingLessons: upcoming,
      weekCalendar: week
    }
  }, [events, now, todayStart])

  if (curriculums === undefined || events === undefined) {
    return <div className="p-6 space-y-4"><Skeleton className="h-10 w-48"/><Skeleton className="h-64 w-full"/></div>
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between dashboard-header">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.teachingDashboard')}</h1>
          <p className="text-muted-foreground mt-1">{t('dashboard.manageCurriculums')}</p>
        </div>
        {isAdmin && <CurriculumDialog />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* LEFT COLUMN - Schedule & Classes */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Next Class Hero */}
          <Card className={`dashboard-card ${
            isLive 
              ? 'border-green-500 dark:border-green-600 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30' 
              : 'border-blue-500 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30'
          }`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Video className={`w-6 h-6 ${isLive ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
                  {isLive ? t('dashboard.classInSession') : t('dashboard.nextClass')}
                </CardTitle>
                {isLive && (
                  <Badge className="bg-red-500 text-white animate-pulse px-3 py-1">
                    ● {t('dashboard.live')}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {nextLesson ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold">{nextLesson.title}</h3>
                    <p className="text-lg font-medium text-muted-foreground">{nextLesson.className}</p>
                    <p className="text-sm text-muted-foreground mt-1">{nextLesson.curriculumTitle}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="time-badge">
                      <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="font-semibold">
                        {format(nextLesson.start, "h:mm a")}
                      </span>
                    </div>
                    <div className="time-badge">
                      <CalendarIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="font-medium">
                        {isToday(nextLesson.start) 
                          ? t('dashboard.today')
                          : isTomorrow(nextLesson.start) 
                          ? t('dashboard.tomorrow')
                          : format(nextLesson.start, "EEEE, MMM d")}
                      </span>
                    </div>
                  </div>

                  <Button 
                    size="lg" 
                    className={`w-full font-bold ${
                      isLive 
                        ? 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800' 
                        : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
                    }`}
                    asChild
                  >
                    <Link href={`/classroom/${nextLesson.roomName}`}>
                      {isLive ? (
                        <><Video className="mr-2 w-5 h-5" /> {t('dashboard.enterLive')}</>
                      ) : (
                        <><BookOpen className="mr-2 w-5 h-5" /> {t('dashboard.goToClassroom')}</>
                      )}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <CalendarIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">{t('dashboard.noClassesScheduled')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          {todayLessons.length > 0 && (
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  {t('dashboard.todaySchedule')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {todayLessons.map((lesson) => (
                    <div 
                      key={lesson.scheduleId}
                      className={`lesson-card ${
                        lesson.isLive 
                          ? 'lesson-live' 
                          : lesson.end < now
                          ? 'lesson-completed'
                          : 'lesson-upcoming'
                      }`}
                    >
                      <div className="lesson-time-box">
                        <span className="text-xs font-bold text-muted-foreground">
                          {format(lesson.start, "h:mm")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(lesson.start, "a")}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-bold">{lesson.title}</h4>
                        <p className="text-sm text-muted-foreground">{lesson.className}</p>
                      </div>

                      {lesson.isLive ? (
                        <Badge className="bg-red-500 text-white animate-pulse">
                          {t('dashboard.live')}
                        </Badge>
                      ) : lesson.end < now ? (
                        <Badge variant="secondary">{t('dashboard.completed')}</Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Classes */}
          {upcomingLessons.length > 0 && (
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  {t('dashboard.upcomingClasses')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {upcomingLessons.map((lesson) => (
                    <div 
                      key={lesson.scheduleId}
                      className="lesson-card lesson-upcoming"
                    >
                      <div className="upcoming-date-box">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase">
                          {format(lesson.start, "MMM")}
                        </span>
                        <span className="text-2xl font-bold">
                          {format(lesson.start, "d")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(lesson.start, "h:mm a")}
                        </span>
                      </div>
                      
                      <div className="flex-1">
                        <h4 className="font-bold">{lesson.title}</h4>
                        <p className="text-sm text-muted-foreground">{lesson.className}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{lesson.curriculumTitle}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/calendar">
                    {t('dashboard.viewFullCalendar')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN - Week View & Curriculums */}
        <div className="space-y-6">
          
          {/* Week Calendar Mini View */}
          <Card className="dashboard-card sidebar-sticky">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                {t('dashboard.thisWeek')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {weekCalendar.map((day, idx) => {
                  const isCurrentDay = isToday(day.date)
                  return (
                    <div 
                      key={idx}
                      className={`calendar-day-card ${isCurrentDay ? 'calendar-day-today' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className={`text-xs font-bold uppercase ${
                            isCurrentDay ? 'text-purple-700 dark:text-purple-300' : 'text-muted-foreground'
                          }`}>
                            {format(day.date, "EEE")}
                          </p>
                          <p className={`text-lg font-bold ${
                            isCurrentDay ? 'text-purple-800 dark:text-purple-200' : ''
                          }`}>
                            {format(day.date, "d")}
                          </p>
                        </div>
                        {day.events.length > 0 && (
                          <Badge className={`${
                            isCurrentDay 
                              ? 'bg-purple-600 dark:bg-purple-500' 
                              : 'bg-blue-600 dark:bg-blue-500'
                          } text-white`}>
                            {day.events.length}
                          </Badge>
                        )}
                      </div>
                      
                      {day.events.length > 0 ? (
                        <div className="space-y-1">
                          {day.events.slice(0, 2).map((evt) => (
                            <div 
                              key={evt.scheduleId}
                              className="event-mini-card"
                            >
                              <p className="font-bold text-sm truncate">
                                {evt.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(evt.start, "h:mm a")}
                              </p>
                            </div>
                          ))}
                          {day.events.length > 2 && (
                            <p className="text-xs text-muted-foreground font-medium pl-2">
                              {t('dashboard.moreClasses', { count: day.events.length - 2 })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">{t('dashboard.noClassesToday')}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Curriculums Quick Access */}
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
                {t('dashboard.myCurriculums')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {curriculums.slice(0, 3).map((curr) => (
                  <Link 
                    key={curr._id} 
                    href={`/curriculums/${curr._id}`}
                    className="curriculum-link-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-sm">{curr.title}</p>
                        {curr.code && (
                          <p className="text-xs text-muted-foreground font-mono">{curr.code}</p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
                {curriculums.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('dashboard.noCurriculums')}
                  </p>
                )}
              </div>
              
              <Button variant="outline" className="w-full mt-3" asChild>
                <Link href="/teaching">
                  {t('dashboard.viewAllCurriculums')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}