"use client"

import { useState, useMemo, Suspense } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import Calendar from "@/components/calendar/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format, isSameDay, startOfDay } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { Video, Calendar as CalendarIcon, BookOpen } from "lucide-react"
import Link from "next/link"
import { CalendarEvent, Mode } from "@/components/calendar/calendar-types"
import { useSearchParams } from "next/navigation"
import { useCurrentUser } from "@/hooks/use-current-user"
import CalendarProvider from "@/components/calendar/calendar-provider"
import CalendarNewEventDialog from "@/components/calendar/dialog/calendar-new-event-dialog"
import CalendarManageEventDialog from "@/components/calendar/dialog/calendar-manage-event-dialog"
import { useCalendarContext } from "@/components/calendar/calendar-context"
import { useTranslations, useLocale } from "next-intl"
import CalendarHeaderCombinedFilter from "@/components/calendar/header/filters/calendar-header-combined-filter"

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

// Internal component to handle Agenda Logic using Context
function AgendaView({ filteredEvents }: { filteredEvents: CalendarEvent[] }) {
  const { setSelectedEvent, setManageEventDialogOpen } = useCalendarContext()

  const t = useTranslations('calendar')
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: CalendarEvent[] } = {}
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const upcomingEvents = filteredEvents
      .filter(e => e.start.getTime() >= today.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
    
    upcomingEvents.forEach((event) => {
      const dateKey = format(startOfDay(event.start), 'yyyy-MM-dd')
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(event)
    })

    // Sort events within each day
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.start.getTime() - b.start.getTime())
    })

    return groups
  }, [filteredEvents])

  const sortedDates = Object.keys(groupedEvents).sort()

  if (sortedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t('noEvents')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sortedDates.map(dateKey => {
        const date = new Date(dateKey)
        const dayEvents = groupedEvents[dateKey]
        const isToday = isSameDay(date, new Date())

        return (
          <div key={dateKey} className="space-y-3">
            <div className="flex items-center gap-2 sticky top-0 bg-background py-2 border-b z-10">
              <h3 className={`text-lg font-semibold ${isToday ? 'text-primary' : ''}`}>
                {format(date, 'EEEE, MMMM d, yyyy', { locale: dateLocale })}
              </h3>
              {isToday && (
                <Badge variant="secondary" className="text-xs">
                  {t('today')}
                </Badge>
              )}
            </div>
            
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <div
                  key={event.scheduleId}
                  onClick={() => {
                    setSelectedEvent(event)
                    setManageEventDialogOpen(true)
                  }}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div className="flex flex-col items-center justify-center min-w-[60px] p-2 rounded-md bg-primary/10 border border-primary/20">
                    <span className="text-xs font-medium text-muted-foreground">
                      {format(event.start, 'h:mm a', { locale: dateLocale })}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(event.end, 'h:mm a', { locale: dateLocale })}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm">{event.className}</h4>
                      {event.isLive && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <Video className="h-3 w-3" />
                          Live
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {event.sessionType === 'live' ? t('live') : 'Ignitia'}
                      </Badge>
                    </div>
                    
                    {event.title && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {event.title}
                      </p>
                    )}
                    
                    {event.curriculumTitle && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <BookOpen className="h-3 w-3" />
                        <span className="line-clamp-1">{event.curriculumTitle}</span>
                      </div>
                    )}
                  </div>

                  <div onClick={(e) => e.stopPropagation()}>
                    {event.isLive ? (
                      <Button size="sm" variant="destructive" asChild>
                        <Link href={`/classroom/${event.roomName}`}>
                          <Video className="mr-2 h-4 w-4" />
                          {t('joinLive')}
                        </Link>
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          setSelectedEvent(event)
                          setManageEventDialogOpen(true)
                        }}
                      >
                        {t('viewDetails')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarContent() {
  const [mode, setMode] = useState<Mode>("month")
  const [date, setDate] = useState<Date>(new Date())
  const [activeTab, setActiveTab] = useState("month")
  const [selectedTeacherId, setSelectedTeacherId] = useState<Id<"users"> | null>(null)
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | null>(null)

  const { user } = useCurrentUser()
  const t = useTranslations()

  // Navigation Hooks
  const searchParams = useSearchParams()
  
  const classIdParam = searchParams.get("classId") as Id<"classes"> | null

  // Fetch Universal Schedule
  const scheduleData = useQuery(api.schedule.getMySchedule, {
    teacherId: selectedTeacherId ?? undefined 
  })

  // Transform to CalendarEvent format
  const allEvents = useMemo(() => {
    if (!scheduleData) return []
    
    return scheduleData.map(e => ({
      id: e.scheduleId,
      _id: e.scheduleId,
      scheduleId: e.scheduleId,
      lessonId: e.lessonId,
      classId: e.classId,
      curriculumId: e.curriculumId,
      teacherId: e.teacherId,
      sessionType: e.sessionType,
      title: e.title,
      description: e.description,
      start: new Date(e.start),
      end: new Date(e.end),
      color: e.color,
      className: e.className,
      curriculumTitle: e.curriculumTitle,
      roomName: e.roomName,
      isLive: e.isLive,
      status: e.status,
      isRecurring: e.isRecurring,
      recurrenceRule: e.recurrenceRule,
      teacherName: e.teacherName,
      teacherImageUrl: e.teacherImageUrl,
    }))
  }, [scheduleData])

  // Filter Logic
  const filteredEvents = useMemo(() => {
    let result = allEvents
    
    if (classIdParam) {
      result = result.filter(e => e.classId === classIdParam)
    }
    
    // Client-side curriculum filter
    if (selectedCurriculumId && !classIdParam) {
      result = result.filter(e => e.curriculumId === selectedCurriculumId)
    }
    
    return result
  }, [allEvents, classIdParam, selectedCurriculumId])

  // Use stable reference for events state
  const [, setEvents] = useState<CalendarEvent[]>([])
  
  // Update events only when filteredEvents actually changes
  useMemo(() => {
    setEvents(filteredEvents)
  }, [filteredEvents])

  if (scheduleData === undefined) {
    return <div className="p-6"><Skeleton className="h-[600px] w-full" /></div>
  }

  return (
    <CalendarProvider
      events={filteredEvents}
      setEvents={setEvents}
      mode={mode}
      setMode={setMode}
      date={date}
      setDate={setDate}
      userId={user?._id}
      selectedTeacherId={selectedTeacherId}
      onTeacherChange={setSelectedTeacherId}
      selectedCurriculumId={selectedCurriculumId}
      onCurriculumChange={setSelectedCurriculumId}
    >
      <div className="flex flex-col h-full w-full">
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="flex flex-col h-full w-full"
        >
          <div className="flex items-center justify-between mb-4 px-1">
            <TabsList>
              <TabsTrigger value="month">{t("calendar.monthView")}</TabsTrigger>
              <TabsTrigger value="agenda">{t("calendar.agendaList")}</TabsTrigger>
            </TabsList>

            <CalendarHeaderCombinedFilter />
          </div>

          <TabsContent value="month" className="flex-1 min-h-0 border rounded-lg bg-background p-4 m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <Calendar 
              events={filteredEvents}
              setEvents={setEvents}
              mode={mode}
              setMode={setMode}
              date={date}
              setDate={setDate}
            />
          </TabsContent>

          <TabsContent value="agenda" className="flex-1 min-h-0 overflow-y-auto m-0 p-4 data-[state=active]:block">
            <AgendaView filteredEvents={filteredEvents} />
          </TabsContent>
        </Tabs>

        {/* Global Dialogs attached to the Provider Context */}
        <CalendarNewEventDialog />
        <CalendarManageEventDialog />
      </div>
    </CalendarProvider>
  )
}

export default function CalendarPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">Manage your schedule and sessions</p>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="p-6"><Skeleton className="h-[600px] w-full" /></div>}>
          <CalendarContent />
        </Suspense>
      </div>
    </div>
  )
}