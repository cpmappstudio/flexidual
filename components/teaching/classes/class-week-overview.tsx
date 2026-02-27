"use client"

import { useMemo, useState } from "react"
import { format, startOfWeek, addDays, isSameDay, startOfDay } from "date-fns"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"

export interface ScheduleItem {
  scheduleId: string
  title: string
  curriculumTitle: string
  start: number
  end: number
  className?: string
}

interface ClassWeekOverviewProps {
  schedules: ScheduleItem[]
  variant?: "vertical" | "horizontal" | "compact"
}

export function ClassWeekOverview({ schedules, variant = "vertical" }: ClassWeekOverviewProps) {
  const t = useTranslations()
  const [isExpanded, setIsExpanded] = useState(true)
  const today = new Date()
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 })

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }).map((_, i) => {
      const date = addDays(startOfCurrentWeek, i + 1)
      const dayStart = startOfDay(date).getTime()
      const dayEnd = dayStart + 86400000
      const dayEvents = schedules.filter(s =>
        s.start >= dayStart && s.start < dayEnd
      ).sort((a, b) => a.start - b.start)
      return { date, isToday: isSameDay(date, today), events: dayEvents }
    })
  }, [schedules, startOfCurrentWeek, today])

  const hasEvents = weekDays.some(d => d.events.length > 0)
  const isHorizontal = variant === "horizontal"
  const isCompact = variant === "compact"

  // --- COMPACT VARIANT ---
  // A slim bar showing only days that have events
  if (isCompact) {
    const activeDays = weekDays.filter(d => d.events.length > 0)

    return (
      <Card className={`overflow-hidden shadow-none border bg-muted/20 py-0 w-full`}>
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors px-4 py-3"
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            {t('class.weekOverview')}
            {hasEvents && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                {activeDays.reduce((acc, d) => acc + d.events.length, 0)}
              </Badge>
            )}
          </CardTitle>
          {isExpanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <CardContent className="pt-0 pb-3 px-4">
                {!hasEvents ? (
                  <p className="text-xs text-muted-foreground italic">
                    {t('calendar.noEventsThisWeek')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeDays.map((day, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                          day.isToday
                            ? 'bg-background border-primary/50 shadow-sm'
                            : 'bg-background/50'
                        }`}
                      >
                        <span className={`font-bold shrink-0 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                          {format(day.date, "EEE")}
                          <span className="font-normal ml-1 text-[10px]">
                            {format(day.date, "d")}
                          </span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {day.events.map(evt => (
                            <div key={evt.scheduleId} className="flex items-center gap-1 overflow-hidden max-w-[200px]">
                              <Badge
                                variant={day.isToday ? "default" : "secondary"}
                                className="text-[10px] h-4 px-1 shrink-0 rounded-[4px]"
                              >
                                {format(evt.start, "h:mm a")}
                              </Badge>
                              <span className="truncate text-muted-foreground font-medium text-[11px]">
                                {evt.curriculumTitle ?? evt.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    )
  }

  // --- VERTICAL / HORIZONTAL VARIANTS (unchanged) ---
  return (
    <Card className={`shadow-none border bg-muted/20 w-full lg:max-w-xs py-0 overflow-hidden`}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors ${isHorizontal ? 'p-4' : 'p-4 pb-3'}`}
      >
        <CardTitle className={`${isHorizontal ? 'text-base' : 'text-sm'} font-medium flex items-center gap-2 text-foreground`}>
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {t('class.weekOverview')}
        </CardTitle>
        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <CardContent className={`${isHorizontal ? 'pt-0 pb-4' : 'p-3 pt-0'}`}>
              {!hasEvents ? (
                <div className="text-xs text-muted-foreground text-center py-2 italic">
                  {t('calendar.noEventsThisWeek')}
                </div>
              ) : (
                <div className={isHorizontal ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 mt-2" : "space-y-2"}>
                  {weekDays.map((day, idx) => {
                    if (day.events.length === 0 && !isHorizontal) return null
                    return (
                      <div key={idx} className={`rounded-md border p-2 flex flex-col ${isHorizontal ? 'min-h-[100px]' : ''} ${day.isToday ? 'bg-background border-primary/50 shadow-sm' : 'bg-background/50'}`}>
                        <div className={`flex items-center justify-between mb-1 ${isHorizontal ? 'border-b pb-1.5 mb-2' : ''}`}>
                          <span className={`font-bold ${isHorizontal ? 'text-sm' : 'text-xs'} ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                            {format(day.date, isHorizontal ? "EEEE" : "EEE")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(day.date, "MMM d")}
                          </span>
                        </div>
                        <div className={`space-y-1.5 ${isHorizontal ? 'flex-1' : ''}`}>
                          {day.events.length === 0 && isHorizontal && (
                            <div className="text-[10px] text-muted-foreground italic text-center py-1">{t('calendar.noEventsDay')}</div>
                          )}
                          {day.events.map(evt => (
                            <div key={evt.scheduleId} className={`flex ${isHorizontal ? 'flex-col gap-0.5' : 'items-center gap-1.5'} overflow-hidden`}>
                              <div className="flex items-center gap-1.5">
                                <Badge variant={day.isToday ? "default" : "secondary"} className="text-[10px] h-4 px-1 shrink-0 rounded-[4px]">
                                  {format(evt.start, "h:mm a")}
                                </Badge>
                                {isHorizontal && evt.className && (
                                  <span className="text-[10px] font-semibold text-foreground truncate">
                                    {evt.className}
                                  </span>
                                )}
                              </div>
                              <span className={`truncate text-muted-foreground font-medium ${isHorizontal ? 'text-[11px] pl-[2px]' : 'text-xs'}`}>
                                {evt.curriculumTitle || evt.title}
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
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}