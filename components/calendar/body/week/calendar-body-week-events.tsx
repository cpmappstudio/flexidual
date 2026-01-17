import { useCalendarContext } from '../../calendar-context'
import { startOfWeek, endOfWeek, isWithinInterval, format } from 'date-fns'

export default function CalendarBodyWeekEvents() {
  const { events, date, setManageEventDialogOpen, setSelectedEvent } =
    useCalendarContext()
  
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
  
  const weekEvents = events.filter((event) =>
    isWithinInterval(event.start, { start: weekStart, end: weekEnd })
  )

  return !!weekEvents.length ? (
    <div className="flex flex-col gap-2">
      <p className="font-medium p-2 pb-0 font-heading">Events This Week</p>
      <div className="flex flex-col gap-2">
        {weekEvents.map((event) => (
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
              <p className="text-xs text-muted-foreground">
                {format(event.start, 'EEE, MMM d')}
              </p>
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
    <div className="p-2 text-muted-foreground">No events this week...</div>
  )
}