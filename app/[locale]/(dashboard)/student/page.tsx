"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Video, Calendar as CalendarIcon, Clock, BookOpen, Trophy, Star } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { format, isToday, isTomorrow, startOfDay, addDays } from "date-fns"
import { useUser } from "@clerk/clerk-react"
import { useMemo } from "react"
import { useTranslations } from "next-intl"
import Image from "next/image"

export default function StudentDashboard() {
  const t = useTranslations()
  const events = useQuery(api.schedule.getMySchedule, {})
  const { user } = useUser()
  
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

    // Week calendar (next 7 days)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Welcome Header */}
        <div className="flex items-center gap-4 bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-border">
          <div className={`w-16 h-16 rounded-full overflow-hidden border-4 border-card shadow-lg ${user?.imageUrl ? "" : "bg-gradient-to-br from-blue-400 to-purple-500"} flex items-center justify-center`}>
            {user?.imageUrl ? (
              <Image 
                src={user.imageUrl} 
                alt={user.firstName || "Student"} 
                width={64}
                height={64}
                className="w-full h-full object-cover" 
              />
            ) : (
              <span className="text-2xl font-bold text-white">
                {user?.firstName?.charAt(0) || "S"}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">
              {t('dashboard.welcome', { name: user?.firstName || 'Student' })}
            </h1>
            <p className="text-muted-foreground text-lg">{t('dashboard.welcomeMessage')}</p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-400 px-4 py-2 rounded-full shadow-md">
            <Trophy className="w-5 h-5 text-white" />
            <span className="text-white font-bold">{t('dashboard.level', { level: 5 })}</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          
          {/* LEFT COLUMN - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* HERO: Next Class */}
            <Card className={`student-hero-card ${
              isLive 
                ? 'border-green-500 dark:border-green-600 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-green-200 dark:shadow-green-900/30' 
                : 'border-blue-400 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 shadow-blue-200 dark:shadow-blue-900/30'
            }`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Video className={`w-6 h-6 ${isLive ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`} />
                    {isLive ? t('dashboard.classLive') : t('dashboard.nextClass')}
                  </CardTitle>
                  {isLive && (
                    <Badge className="bg-red-500 text-white animate-pulse px-3 py-1 text-sm">
                      ● {t('dashboard.liveNow')}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {nextLesson ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-3xl font-bold mb-1">
                        {nextLesson.title}
                      </h3>
                      <p className="text-xl font-medium text-muted-foreground">
                        {nextLesson.className}
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="time-badge">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="font-bold">
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
                      className={`w-full text-lg font-bold shadow-lg ${
                        isLive 
                          ? 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 animate-pulse' 
                          : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'
                      }`}
                      asChild
                    >
                      <Link href={`/classroom/${nextLesson.roomName}`}>
                        {isLive ? (
                          <><Video className="mr-2 w-5 h-5" /> {t('dashboard.joinNow')}</>
                        ) : (
                          <><BookOpen className="mr-2 w-5 h-5" /> {t('dashboard.enterClassroom')}</>
                        )}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full flex items-center justify-center shadow-lg">
                      <Star className="w-12 h-12 text-white" />
                    </div>
                    <p className="text-xl font-bold mb-2">
                      {t('dashboard.noClasses')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('dashboard.enjoyFreeTime')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Today's Schedule */}
            {todayLessons.length > 0 && (
              <Card className="student-card border-purple-300 dark:border-purple-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <CalendarIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    {t('dashboard.todayClasses')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {todayLessons.map((lesson) => (
                      <div 
                        key={lesson.scheduleId}
                        className={`student-lesson-card ${
                          lesson.isLive 
                            ? 'bg-green-100 dark:bg-green-950/30 border-green-400 dark:border-green-700' 
                            : lesson.end < now
                            ? 'bg-muted border-border opacity-60'
                            : 'bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600'
                        }`}
                      >
                        <div className="lesson-time-box">
                          <span className="text-xs font-bold">
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

                        {lesson.isLive && (
                          <Badge className="bg-red-500 text-white animate-pulse">
                            {t('dashboard.live')}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Lessons */}
            {upcomingLessons.length > 0 && (
              <Card className="student-card border-orange-300 dark:border-orange-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    {t('dashboard.comingUp')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {upcomingLessons.map((lesson) => (
                      <div 
                        key={lesson.scheduleId}
                        className="student-lesson-card bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-950/30 dark:to-yellow-950/30 border-orange-200 dark:border-orange-800 hover:border-orange-300 dark:hover:border-orange-700"
                      >
                        <div className="upcoming-date-box border-orange-300 dark:border-orange-700">
                          <span className="text-sm font-bold text-orange-600 dark:text-orange-400 uppercase">
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
                          <h4 className="font-bold text-lg">{lesson.title}</h4>
                          <p className="text-sm text-muted-foreground font-medium">{lesson.className}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <Button variant="outline" className="w-full mt-4 border-2 border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/30" asChild>
                    <Link href="/calendar">
                      {t('dashboard.viewFullCalendar')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT COLUMN - Week Calendar Mini View */}
          <div className="space-y-6">
            <Card className="student-card border-pink-300 dark:border-pink-700 sidebar-sticky">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CalendarIcon className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                  {t('dashboard.thisWeek')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                  {weekCalendar.map((day, idx) => {
                    const isCurrentDay = isToday(day.date)
                    return (
                      <div 
                        key={idx}
                        className={`student-week-card ${
                          isCurrentDay 
                            ? 'student-week-today' 
                            : day.hasEvents
                            ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700'
                            : 'bg-muted border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className={`text-xs font-bold uppercase ${
                              isCurrentDay ? 'text-pink-700 dark:text-pink-300' : 'text-muted-foreground'
                            }`}>
                              {format(day.date, "EEE")}
                            </p>
                            <p className={`text-lg font-bold ${
                              isCurrentDay ? 'text-pink-800 dark:text-pink-200' : ''
                            }`}>
                              {format(day.date, "d")}
                            </p>
                          </div>
                          {day.events.length > 0 && (
                            <Badge className={`${
                              isCurrentDay 
                                ? 'bg-pink-600 dark:bg-pink-500' 
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
                
                <Button variant="outline" className="w-full mt-4 border-2 border-pink-300 dark:border-pink-700 hover:bg-pink-50 dark:hover:bg-pink-950/30" asChild>
                  <Link href="/calendar">
                    {t('dashboard.fullCalendar')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}