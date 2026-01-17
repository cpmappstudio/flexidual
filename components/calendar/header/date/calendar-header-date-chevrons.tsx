import { Button } from '@/components/ui/button'
import { useCalendarContext } from '../../calendar-context'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  format,
  addDays,
  addMonths,
  addWeeks,
  subDays,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
} from 'date-fns'
import CalendarHeaderDateBadge from './calendar-header-date-badge'

export default function CalendarHeaderDateChevrons() {
  const { mode, date, setDate } = useCalendarContext()

  function handleDateBackward() {
    switch (mode) {
      case 'month':
        setDate(subMonths(date, 1))
        break
      case 'week':
        setDate(subWeeks(date, 1))
        break
      case 'day':
        setDate(subDays(date, 1))
        break
    }
  }

  function handleDateForward() {
    switch (mode) {
      case 'month':
        setDate(addMonths(date, 1))
        break
      case 'week':
        setDate(addWeeks(date, 1))
        break
      case 'day':
        setDate(addDays(date, 1))
        break
    }
  }

  function getDateLabel() {
    switch (mode) {
      case 'month':
        return format(date, 'MMMM yyyy')
      case 'week':
        const weekStart = startOfWeek(date)
        const weekEnd = endOfWeek(date)
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
      case 'day':
        return format(date, 'MMMM d, yyyy')
      default:
        return format(date, 'MMMM d, yyyy')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        className="h-7 w-7 p-1"
        onClick={handleDateBackward}
      >
        <ChevronLeft className="min-w-5 min-h-5" />
      </Button>

      <span className="min-w-[140px] text-center font-medium">
        {getDateLabel()}
      </span>

      <Button
        variant="outline"
        className="h-7 w-7 p-1"
        onClick={handleDateForward}
      >
        <ChevronRight className="min-w-5 min-h-5" />
      </Button>
      <CalendarHeaderDateBadge />
    </div>
  )
}