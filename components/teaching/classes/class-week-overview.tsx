"use client"

import { useMemo } from "react"
import { format, startOfWeek, addDays, isSameDay, startOfDay } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar as CalendarIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

interface ScheduleItem {
  scheduleId: string
  title: string
  start: number
  end: number
  [key: string]: any
}

interface ClassWeekOverviewProps {
  schedules: ScheduleItem[]
}

export function ClassWeekOverview({ schedules }: ClassWeekOverviewProps) {
  const t = useTranslations()
  const today = new Date()
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 }) // Sunday

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }).map((_, i) => {
      // Create Mon-Fri dates
      const date = addDays(startOfCurrentWeek, i + 1)
      const dayStart = startOfDay(date).getTime()
      const dayEnd = dayStart + 86400000

      const dayEvents = schedules.filter(s => 
        s.start >= dayStart && s.start < dayEnd
      ).sort((a, b) => a.start - b.start)

      return {
        date,
        isToday: isSameDay(date, today),
        events: dayEvents
      }
    })
  }, [schedules, startOfCurrentWeek, today])

  const hasEvents = weekDays.some(d => d.events.length > 0)

  return (
    <Card className="shadow-none border bg-muted/20 w-full lg:max-w-xs">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <CalendarIcon className="h-4 w-4" />
          {t('class.weekOverview')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {!hasEvents ? (
          <div className="text-xs text-muted-foreground text-center py-2 italic">
            {t('calendar.noEventsThisWeek')}
          </div>
        ) : (
          <div className="space-y-2">
            {weekDays.map((day, idx) => {
              if (day.events.length === 0) return null
              return (
                <div key={idx} className={`rounded-md border p-2 text-xs ${day.isToday ? 'bg-background border-primary/50 shadow-sm' : 'bg-background/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-bold ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day.date, "EEE")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(day.date, "MMM d")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {day.events.map(evt => (
                      <div key={evt.scheduleId} className="flex items-center gap-1.5 overflow-hidden">
                        <Badge variant={day.isToday ? "default" : "secondary"} className="text-[10px] h-4 px-1 shrink-0 rounded-[4px]">
                          {format(evt.start, "h:mm a")}
                        </Badge>
                        <span className="truncate text-muted-foreground font-medium">
                          {evt.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}