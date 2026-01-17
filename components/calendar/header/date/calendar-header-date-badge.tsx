import { useCalendarContext } from '../../calendar-context'
import { isSameMonth, isSameDay, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'

export default function CalendarHeaderDateBadge() {
  const { events, date, mode } = useCalendarContext()
  
  let filteredEvents = []
  
  switch (mode) {
    case 'month':
      filteredEvents = events.filter((event) => isSameMonth(event.start, date))
      break
    case 'week':
      const weekStart = startOfWeek(date, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
      filteredEvents = events.filter((event) =>
        isWithinInterval(event.start, { start: weekStart, end: weekEnd })
      )
      break
    case 'day':
      filteredEvents = events.filter((event) => isSameDay(event.start, date))
      break
    default:
      filteredEvents = events.filter((event) => isSameMonth(event.start, date))
  }

  if (!filteredEvents.length) return null
  
  return (
    <div className="whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-xs">
      {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
    </div>
  )
}