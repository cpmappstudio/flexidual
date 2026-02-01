import { useCalendarContext } from '../../calendar-context'
import { startOfWeek, addDays } from 'date-fns'
import CalendarBodyMarginDayMargin from '../day/calendar-body-margin-day-margin'
import CalendarBodyDayContent from '../day/calendar-body-day-content'
import CalendarBodyDayCalendar from '../day/calendar-body-day-calendar'
import CalendarBodyWeekEvents from './calendar-body-week-events'

export default function CalendarBodyWeek() {
  const { date } = useCalendarContext()

  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="flex divide-x h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="relative flex min-h-full divide-x flex-col md:flex-row">
            <CalendarBodyMarginDayMargin className="hidden md:block" />
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="flex flex-1 min-w-0 divide-x md:divide-x-0"
              >
                <CalendarBodyMarginDayMargin className="block md:hidden" />
                <CalendarBodyDayContent date={day} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="lg:flex hidden flex-col w-64 divide-y overflow-hidden">
        <CalendarBodyDayCalendar />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CalendarBodyWeekEvents />
        </div>
      </div>
    </div>
  )
}