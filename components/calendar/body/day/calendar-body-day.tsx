import CalendarBodyDayCalendar from './calendar-body-day-calendar'
import CalendarBodyDayEvents from './calendar-body-day-events'
import { useCalendarContext } from '../../calendar-context'
import CalendarBodyDayContent from './calendar-body-day-content'
import CalendarBodyMarginDayMargin from './calendar-body-margin-day-margin'

export default function CalendarBodyDay() {
  const { date } = useCalendarContext()
  return (
    <div className="flex divide-x h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="relative flex min-h-full divide-x">
            <CalendarBodyMarginDayMargin />
            <CalendarBodyDayContent date={date} />
          </div>
        </div>
      </div>
      <div className="lg:flex hidden flex-col w-64 divide-y overflow-hidden">
        <CalendarBodyDayCalendar />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CalendarBodyDayEvents />
        </div>
      </div>
    </div>
  )
}