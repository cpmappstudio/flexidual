import { format, isSameDay } from 'date-fns'
import { enUS, es, ptBR } from 'date-fns/locale'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

export default function CalendarBodyHeader({
  date,
  onlyDay = false,
}: {
  date: Date
  onlyDay?: boolean
}) {
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS
  const isToday = isSameDay(date, new Date())

  return (
    <div className="flex items-center justify-center gap-1 py-1.5 w-full sticky top-0 bg-background z-10 border-b">
      <span
        className={cn(
          'text-[10px] font-medium',
          isToday ? 'text-deep-koamaru' : 'text-muted-foreground'
        )}
      >
        {format(date, 'EEE', { locale: dateLocale })}
      </span>
      {!onlyDay && (
        <span
          className={cn(
            'text-[10px] font-medium',
            isToday ? 'text-deep-koamaru font-bold' : 'text-foreground'
          )}
        >
          {format(date, 'dd', { locale: dateLocale })}
        </span>
      )}
    </div>
  )
}