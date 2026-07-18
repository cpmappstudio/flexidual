import CalendarBodyDayCalendar from './calendar-body-day-calendar'
import CalendarBodyDayEvents from './calendar-body-day-events'
import { useCalendarContext } from '../../calendar-context'
import CalendarBodyDayContent from './calendar-body-day-content'
import CalendarBodyMarginDayMargin from './calendar-body-margin-day-margin'

export default function CalendarBodyDay() {
  const { date } = useCalendarContext()
  return (
    <div className="flex h-full divide-x overflow-hidden [--calendar-hour-height:4rem] xl:[--calendar-hour-height:5rem] 2xl:[--calendar-hour-height:6rem]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
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