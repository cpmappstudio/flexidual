import { useCalendarContext } from '../../calendar-context'
import { isSameDay } from 'date-fns'
import { useTranslations } from 'next-intl'

export default function CalendarBodyDayEvents() {
  const { events, date, setManageEventDialogOpen, setSelectedEvent } =
    useCalendarContext()
  const t = useTranslations('calendar')
  const dayEvents = events.filter((event) => isSameDay(event.start, date))

  return !!dayEvents.length ? (
    <div className="flex flex-col gap-2">
      <p className="font-medium p-2 pb-0 font-heading">{t('eventsToday')}</p>
      <div className="flex flex-col gap-2">
        {dayEvents.map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-2 px-2 cursor-pointer hover:bg-muted/50 rounded-md py-1 transition-colors"
            onClick={() => {
              setSelectedEvent(event)
              setManageEventDialogOpen(true)
            }}
          >
            <div className={`size-2 rounded-full bg-${event.color}-500 shrink-0`} />
            <div className="flex flex-col min-w-0">
              {event.curriculumTitle && (
                <p className="text-sm font-semibold truncate">
                  {event.curriculumTitle}
                </p>
              )}
              {event.title && (
                <p className="text-muted-foreground text-sm truncate">
                  {event.title}
                </p>
              )}
              {event.className && (
                <p className="text-muted-foreground text-xs truncate">
                  {event.className}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="p-2 text-muted-foreground">{t('noEventsToday')}</div>
  )
}