import CalendarHeaderDateIcon from './calendar-header-date-icon'
import CalendarHeaderDateChevrons from './calendar-header-date-chevrons'

export default function CalendarHeaderDate() {
  return (
    <div className="flex items-center gap-2">
      <CalendarHeaderDateIcon />
      <div>
        <CalendarHeaderDateChevrons />
      </div>
    </div>
  )
}
