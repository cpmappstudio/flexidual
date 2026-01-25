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
import { format } from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { Video, Calendar as CalendarIcon, X } from "lucide-react"
import Link from "next/link"
import { CalendarEvent, Mode } from "@/components/calendar/calendar-types"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
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
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const upcomingEvents = filteredEvents
    .filter(e => e.start.getTime() >= today.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 20)

  if (upcomingEvents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t('noUpcoming')}
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {upcomingEvents.map((event) => (
        <Card 
          key={event.scheduleId} 
          className={`cursor-pointer hover:border-primary/50 transition-colors ${event.isLive ? "border-green-500/50 bg-green-500/5" : ""}`}
          onClick={() => {
            setSelectedEvent(event)
            setManageEventDialogOpen(true)
          }}
        >
          <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            
            {/* Time Box */}
            <div className="flex flex-col items-center justify-center min-w-[80px] text-center p-2 bg-muted rounded-md">
              <span className="text-sm font-bold uppercase text-muted-foreground">
                {format(event.start, "MMM", { locale: dateLocale })}
              </span>
              <span className="text-2xl font-bold">
                {format(event.start, "d", { locale: dateLocale })}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(event.start, "h:mm a", { locale: dateLocale })}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{event.title}</h3>
                {event.isLive && (
                  <Badge variant="destructive" className="animate-pulse">
                    {t('live')}
                  </Badge>
                )}
                {event.status === "cancelled" && (
                  <Badge variant="secondary">{t('cancelled')}</Badge>
                )}
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {event.curriculumTitle}
              </p>
              <p className="text-muted-foreground flex items-center gap-2">
                <CalendarIcon className="h-3.5 w-3.5" />
                {event.className}
              </p>
            </div>

            {/* Actions */}
            <div className="w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
              {event.isLive ? (
                <Button className="w-full sm:w-auto" variant="destructive" asChild>
                  <Link href={`/classroom/${event.roomName}`}>
                    <Video className="mr-2 h-4 w-4" />
                    {t('joinLive')}
                  </Link>
                </Button>
              ) : (
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => {
                  setSelectedEvent(event)
                  setManageEventDialogOpen(true)
                }}>
                  {t('viewDetails')}
                </Button>
              )}
            </div>

          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CalendarContent() {
  const [mode, setMode] = useState<Mode>("month")
  const [date, setDate] = useState<Date>(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedTeacherId, setSelectedTeacherId] = useState<Id<"users"> | null>(null)
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | null>(null)

  const { user } = useCurrentUser()
  const t = useTranslations()

  // Navigation Hooks
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const classIdParam = searchParams.get("classId") as Id<"classes"> | null

  // Fetch Universal Schedule
  // We fetch a broader range or use dynamic ranges in a real app
  // For now, fetching everything (filtered by backend limit) or adding args
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
    
    // Client-side curriculum filter (in case backend doesn't filter)
    if (selectedCurriculumId && !classIdParam) {
      result = result.filter(e => e.curriculumId === selectedCurriculumId)
    }
    
    return result
  }, [allEvents, classIdParam, selectedCurriculumId])

  // Update events state when data changes
  // Note: CalendarProvider uses this state
  if (events !== filteredEvents && scheduleData) {
     setEvents(filteredEvents)
  }

  const clearFilter = () => {
    router.push(pathname)
  }

  const currentClassName = classIdParam && filteredEvents.length > 0 
    ? filteredEvents[0].className 
    : "Current Class"

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
      <div className="min-h-[calc(100vh)] flex flex-col pb-12">
        <Tabs defaultValue="month" className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="month">{t("calendar.monthView")}</TabsTrigger>
              <TabsTrigger value="agenda">{t("calendar.agendaList")}</TabsTrigger>
            </TabsList>

            <CalendarHeaderCombinedFilter />
          </div>

          <TabsContent value="month" className="flex-1 border rounded-lg bg-background p-2">
            <Calendar 
              events={filteredEvents}
              setEvents={setEvents}
              mode={mode}
              setMode={setMode}
              date={date}
              setDate={setDate}
            />
          </TabsContent>

          <TabsContent value="agenda" className="flex-1 overflow-auto">
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
    <Suspense fallback={<div className="p-6"><Skeleton className="h-[600px] w-full" /></div>}>
      <CalendarContent />
    </Suspense>
  )
}