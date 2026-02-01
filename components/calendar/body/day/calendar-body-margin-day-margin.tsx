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
        'sticky left-0 w-16 xl:w-20 bg-background z-10 flex flex-col shrink-0',
        className
      )}
    >
      <div className="sticky top-0 left-0 h-7 bg-background z-20 border-b" />
      <div className="flex flex-col">
        {hours.map((hour) => (
          <div key={hour} className="relative h-16 xl:h-20 2xl:h-24 first:mt-0">
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