import { format } from 'date-fns'
import { enUS, es, ptBR } from 'date-fns/locale'
import { useLocale } from 'next-intl'
import { useCalendarContext } from '../../calendar-context'

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const

export default function CalendarHeaderDateIcon() {
  const { calendarIconIsToday, date: calendarDate } = useCalendarContext()
  const locale = useLocale()
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS
  
  const date = calendarIconIsToday ? new Date() : calendarDate

  return (
    <div className="flex size-14 flex-col items-start overflow-hidden rounded-lg border">
      <p className="flex h-6 w-full items-center justify-center bg-deep-koamaru text-center text-xs font-semibold text-white uppercase">
        {format(date, 'MMM', { locale: dateLocale })}
      </p>
      <p className="flex w-full items-center justify-center text-lg font-bold">
        {format(date, 'dd', { locale: dateLocale })}
      </p>
    </div>
  )
}