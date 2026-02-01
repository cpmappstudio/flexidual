"use client"

import { useState, useMemo, Suspense } from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import Calendar from "@/components/calendar/calendar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { format, isSameDay, startOfDay } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { useSearchParams } from "next/navigation"
import { useCurrentUser } from "@/hooks/use-current-user"
import CalendarProvider from "@/components/calendar/calendar-provider"
import CalendarNewEventDialog from "@/components/calendar/dialog/calendar-new-event-dialog"
import CalendarManageEventDialog from "@/components/calendar/dialog/calendar-manage-event-dialog"
import { useCalendarContext } from "@/components/calendar/calendar-context"
import { useTranslations, useLocale } from "next-intl"
import CalendarHeaderCombinedFilter from "@/components/calendar/header/filters/calendar-header-combined-filter"
import { CalendarEvent, Mode } from "@/components/calendar/calendar-types"
import { ScheduleItem } from "@/components/schedule/schedule-item"

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

// Internal component to handle Agenda Logic using Context
function AgendaView({ filteredEvents }: { filteredEvents: CalendarEvent[] }) {
  const { setSelectedEvent, setManageEventDialogOpen } = useCalendarContext()

  const t = useTranslations()
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: { date: Date; events: CalendarEvent[] } } = {}
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const upcomingEvents = filteredEvents
      .filter(e => e.start.getTime() >= today.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
    
    upcomingEvents.forEach((event) => {
      const eventDateStart = startOfDay(event.start)
      const dateKey = format(eventDateStart, 'yyyy-MM-dd')
      if (!groups[dateKey]) {
        groups[dateKey] = { date: eventDateStart, events: [] }
      }
      groups[dateKey].events.push(event)
    })

    // Sort events within each day
    Object.keys(groups).forEach(key => {
      groups[key].events.sort((a, b) => a.start.getTime() - b.start.getTime())
    })

    return groups
  }, [filteredEvents])

  const sortedDates = Object.keys(groupedEvents).sort()

  if (sortedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t('calendar.noUpcoming')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sortedDates.map(dateKey => {
        const { date, events: dayEvents } = groupedEvents[dateKey]
        const isToday = isSameDay(date, new Date())

        return (
          <div key={dateKey} className="space-y-3">
            <div className="flex items-center gap-2 bg-background py-2 border-b z-10">
              <h3 className={`text-lg font-semibold ${isToday ? 'text-primary' : ''}`}>
                {format(date, 'EEEE, MMMM d, yyyy', { locale: dateLocale })}
              </h3>
              {isToday && (
                <Badge variant="secondary" className="text-xs">
                  {t('dashboard.today')}
                </Badge>
              )}
            </div>
            
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <ScheduleItem
                  key={event.scheduleId}
                  schedule={{
                    scheduleId: event.scheduleId,
                    lessonId: event.lessonId,
                    classId: event.classId,
                    title: event.title || event.className,
                    description: event.description,
                    start: event.start,
                    end: event.end,
                    roomName: event.roomName || "",
                    sessionType: event.sessionType,
                    isLive: event.isLive,
                    status: event.status,
                    className: event.className,
                    curriculumTitle: event.curriculumTitle,
                  }}
                  showDate={false}
                  showEdit={false}
                  showDescription={false}
                  onEventClick={() => {
                    setSelectedEvent(event)
                    setManageEventDialogOpen(true)
                  }}
                />
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

  const searchParams = useSearchParams()
  const classIdParam = searchParams.get("classId") as Id<"classes"> | null

  const scheduleData = useQuery(api.schedule.getMySchedule, {
    teacherId: selectedTeacherId ?? undefined 
  })

  const allEvents = useMemo(() => {
    if (!scheduleData) return []
    
    return scheduleData.map(e => ({
      id: e.scheduleId,
      _id: e.scheduleId,
      scheduleId: e.scheduleId,
      lessonId: e.lessonId,
      classId: e.classId,
      curriculumId: e.curriculumId,
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

  const filteredEvents = useMemo(() => {
    let result = allEvents
    
    if (classIdParam) {
      result = result.filter(e => e.classId === classIdParam)
    }
    
    if (selectedCurriculumId && !classIdParam) {
      result = result.filter(e => e.curriculumId === selectedCurriculumId)
    }
    
    return result
  }, [allEvents, classIdParam, selectedCurriculumId])

  const [, setEvents] = useState<CalendarEvent[]>([])
  
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

        <CalendarNewEventDialog />
        <CalendarManageEventDialog />
      </div>
    </CalendarProvider>
  )
}

export default function CalendarPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full p-6">
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="p-6"><Skeleton className="h-[600px] w-full" /></div>}>
          <CalendarContent />
        </Suspense>
      </div>
    </div>
  )
}