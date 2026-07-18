import { Button } from "@/components/ui/button"
import { useCalendarContext } from "../../calendar-context"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
} from "date-fns"
import { enUS, es, ptBR } from "date-fns/locale"
import { useLocale, useTranslations } from "next-intl"
import CalendarHeaderDateBadge from "./calendar-header-date-badge"

const localeMap = {
  en: enUS,
  es,
  "pt-BR": ptBR,
} as const

export default function CalendarHeaderDateChevrons() {
  const { mode, date, setDate } = useCalendarContext()
  const locale = useLocale()
  const tDashboard = useTranslations("dashboard")
  const tCommon = useTranslations("common")
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS

  function handleDateBackward() {
    if (mode === "month") setDate(subMonths(date, 1))
    if (mode === "week") setDate(subWeeks(date, 1))
    if (mode === "day") setDate(subDays(date, 1))
  }

  function handleDateForward() {
    if (mode === "month") setDate(addMonths(date, 1))
    if (mode === "week") setDate(addWeeks(date, 1))
    if (mode === "day") setDate(addDays(date, 1))
  }

  function getDateLabel() {
    if (mode === "month") {
      return format(date, "MMMM yyyy", { locale: dateLocale })
    }

    if (mode === "week") {
      const weekStart = startOfWeek(date, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
      return `${format(weekStart, "MMM d", { locale: dateLocale })} – ${format(weekEnd, "MMM d, yyyy", { locale: dateLocale })}`
    }

    return format(date, "MMMM d, yyyy", { locale: dateLocale })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="h-9 bg-sidebar hover:bg-accent"
        onClick={() => setDate(new Date())}
      >
        {tDashboard("today")}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={tCommon("previous")}
        title={tCommon("previous")}
        onClick={handleDateBackward}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={tCommon("next")}
        title={tCommon("next")}
        onClick={handleDateForward}
      >
        <ChevronRight className="size-4" />
      </Button>

      <span className="min-w-0 text-lg font-bold capitalize sm:text-xl">
        {getDateLabel()}
      </span>
      <CalendarHeaderDateBadge />
    </div>
  )
}
