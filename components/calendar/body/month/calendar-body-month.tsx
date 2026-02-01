import { useCalendarContext } from '../../calendar-context'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  isWithinInterval,
} from 'date-fns'
import { enUS, es, ptBR } from 'date-fns/locale'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import CalendarEvent from '../../calendar-event'
import { AnimatePresence, motion } from 'framer-motion'

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

export default function CalendarBodyMonth() {
  const { date, events, setDate, setMode } = useCalendarContext()
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS
  const t = useTranslations('calendar')

  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1, locale: dateLocale })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1, locale: dateLocale })

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  })

  const today = new Date()

  const visibleEvents = events.filter(
    (event) =>
      isWithinInterval(event.start, {
        start: calendarStart,
        end: calendarEnd,
      }) ||
      isWithinInterval(event.end, { start: calendarStart, end: calendarEnd })
  )

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(2024, 0, 1 + i)
    return format(day, 'EEE', { locale: dateLocale })
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="hidden md:grid grid-cols-7 border-b sticky top-0 bg-background z-10">
        {weekDays.map((day, index) => (
          <div
            key={index}
            className="py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={monthStart.toISOString()}
          className="grid md:grid-cols-7 flex-1 min-h-0 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.2,
            ease: 'easeInOut',
          }}
        >
          {calendarDays.map((day) => {
            const dayEvents = visibleEvents.filter((event) =>
              isSameDay(event.start, day)
            )
            const isToday = isSameDay(day, today)
            const isCurrentMonth = isSameMonth(day, date)

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'relative flex flex-col border-b border-r p-1.5 min-h-[100px] cursor-pointer',
                  !isCurrentMonth && 'bg-muted/50 hidden md:flex'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  setDate(day)
                  setMode('day')
                }}
              >
                <div
                  className={cn(
                    'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                    isToday && 'bg-deep-koamaru text-white'
                  )}
                >
                  {format(day, 'd', { locale: dateLocale })}
                </div>
                <AnimatePresence mode="wait">
                  <div className="flex flex-col gap-0.5 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((event) => (
                      <CalendarEvent
                        key={event.id}
                        event={event}
                        className="relative h-auto text-[10px] px-1.5 py-0.5"
                        month
                      />
                    ))}
                    {dayEvents.length > 2 && (
                      <motion.div
                        key={`more-${day.toISOString()}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          duration: 0.2,
                        }}
                        className="text-[10px] text-muted-foreground px-1.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDate(day)
                          setMode('day')
                        }}
                      >
                        {t('moreEvents', { count: dayEvents.length - 2 })}
                      </motion.div>
                    )}
                  </div>
                </AnimatePresence>
              </div>
            )
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}