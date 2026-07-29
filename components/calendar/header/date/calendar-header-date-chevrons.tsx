import { Button } from "@/components/ui/button";
import { useCalendarContext } from "../../calendar-context";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import CalendarHeaderDateBadge from "./calendar-header-date-badge";
import CalendarTimeZoneBadge from "./calendar-time-zone-badge";
import { TZDate, tz } from "@date-fns/tz";
import { shiftCalendarDate } from "../../calendar-navigation";
import { ResponsivePageAction } from "@/components/ui/responsive-page-action";

const localeMap = {
  en: enUS,
  es,
  "pt-BR": ptBR,
} as const;

export default function CalendarHeaderDateChevrons() {
  const { mode, date, setDate, displayTimeZone } = useCalendarContext();
  const locale = useLocale();
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;

  function getDateLabel(compact = false) {
    if (mode === "month") {
      return format(date, "MMMM yyyy", {
        locale: dateLocale,
        in: tz(displayTimeZone),
      });
    }

    if (mode === "week") {
      const weekStart = startOfWeek(date, {
        weekStartsOn: 1,
        in: tz(displayTimeZone),
      });
      const weekEnd = endOfWeek(date, {
        weekStartsOn: 1,
        in: tz(displayTimeZone),
      });
      if (compact) {
        return `${format(weekStart, "MMM d", { locale: dateLocale, in: tz(displayTimeZone) })} – ${format(weekEnd, "MMM d", { locale: dateLocale, in: tz(displayTimeZone) })}`;
      }
      return `${format(weekStart, "MMM d", { locale: dateLocale, in: tz(displayTimeZone) })} – ${format(weekEnd, "MMM d, yyyy", { locale: dateLocale, in: tz(displayTimeZone) })}`;
    }

    return format(date, compact ? "MMM d" : "MMMM d, yyyy", {
      locale: dateLocale,
      in: tz(displayTimeZone),
    });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <ResponsivePageAction mobileVariant="label">
        <Button
          variant="outline"
          size="sm"
          className="h-9 bg-sidebar hover:bg-accent"
          onClick={() => setDate(TZDate.tz(displayTimeZone))}
        >
          {tDashboard("today")}
        </Button>
      </ResponsivePageAction>

      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        aria-label={tCommon("previous")}
        title={tCommon("previous")}
        onClick={() => setDate(shiftCalendarDate(date, mode, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        aria-label={tCommon("next")}
        title={tCommon("next")}
        onClick={() => setDate(shiftCalendarDate(date, mode, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>

      <span className="min-w-0 truncate text-lg font-bold capitalize sm:text-xl md:hidden">
        {getDateLabel(true)}
      </span>
      <span className="hidden min-w-0 truncate text-xl font-bold capitalize md:block">
        {getDateLabel(false)}
      </span>
      <CalendarHeaderDateBadge />
      <CalendarTimeZoneBadge />
    </div>
  );
}
