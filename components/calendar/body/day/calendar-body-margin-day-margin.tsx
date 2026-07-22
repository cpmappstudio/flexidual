import { format } from 'date-fns'
import { enUS, es, ptBR } from 'date-fns/locale'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

export const hours = Array.from({ length: 24 }, (_, i) => i)

export default function CalendarBodyMarginDayMargin({
  className,
  startMinutes = 0,
  endMinutes = 24 * 60,
}: {
  className?: string
  startMinutes?: number
  endMinutes?: number
}) {
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS
  const durationMinutes = endMinutes - startMinutes
  const markers = hours.filter((hour) => {
    const minutes = hour * 60
    return minutes > startMinutes && minutes < endMinutes
  })

  return (
    <div
      className={cn(
        'sticky left-0 z-10 flex w-16 shrink-0 flex-col bg-sidebar xl:w-20',
        className
      )}
    >
      <div className="sticky top-0 left-0 z-20 h-7 border-b bg-sidebar" />
      <div
        className="relative"
        style={{
          height: `calc(var(--calendar-hour-height) * ${durationMinutes / 60})`,
        }}
      >
        {markers.map((hour) => (
          <span
            key={hour}
            className="absolute left-1 -translate-y-1/2 text-xs text-muted-foreground xl:left-2 xl:text-sm"
            style={{
              top: `${((hour * 60 - startMinutes) / durationMinutes) * 100}%`,
            }}
          >
            {format(new Date().setHours(hour, 0, 0, 0), 'h a', { locale: dateLocale })}
          </span>
        ))}
      </div>
    </div>
  )
}
