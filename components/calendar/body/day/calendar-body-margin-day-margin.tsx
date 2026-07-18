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
}: {
  className?: string
}) {
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS

  return (
    <div
      className={cn(
        'sticky left-0 z-10 flex w-16 shrink-0 flex-col bg-sidebar xl:w-20',
        className
      )}
    >
      <div className="sticky top-0 left-0 z-20 h-7 border-b bg-sidebar" />
      <div className="flex flex-col">
        {hours.map((hour) => (
          <div key={hour} className="relative h-(--calendar-hour-height) first:mt-0">
            {hour !== 0 && (
              <span className="absolute text-xs xl:text-sm text-muted-foreground -top-2 xl:-top-2.5 left-1 xl:left-2">
                {format(new Date().setHours(hour, 0, 0, 0), 'h a', { locale: dateLocale })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}