import { format, isSameDay } from 'date-fns'
import { cn } from '@/lib/utils'

export default function CalendarBodyHeader({
  date,
  onlyDay = false,
}: {
  date: Date
  onlyDay?: boolean
}) {
  const isToday = isSameDay(date, new Date())

  return (
    <div className="flex items-center justify-center gap-1 py-2 w-full sticky top-0 bg-background z-10 border-b">
      <span
        className={cn(
          'text-xs font-medium',
          isToday ? 'text-deep-koamaru' : 'text-muted-foreground'
        )}
      >
        {format(date, 'EEE')}
      </span>
      {!onlyDay && (
        <span
          className={cn(
            'text-xs font-medium',
            isToday ? 'text-deep-koamaru font-bold' : 'text-foreground'
          )}
        >
          {format(date, 'dd')}
        </span>
      )}
    </div>
  )
}
