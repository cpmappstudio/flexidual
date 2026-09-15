import { format, isSameDay } from "date-fns";
import { TZDate, tz } from "@date-fns/tz";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useOptionalCalendarContext } from "../calendar-context";
import { CalendarClosureBadge } from "../calendar-closure-marker";
import type { CalendarClosureSummary } from "../calendar-closure-types";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

export default function CalendarBodyHeader({
  date,
  closures = [],
  onlyDay = false,
  displayTimeZone,
}: {
  date: Date;
  closures?: CalendarClosureSummary[];
  onlyDay?: boolean;
  displayTimeZone?: string;
}) {
  const calendarContext = useOptionalCalendarContext();
  const resolvedTimeZone = displayTimeZone ?? calendarContext?.displayTimeZone;
  if (!resolvedTimeZone) {
    throw new Error("CalendarBodyHeader requires a display time zone");
  }
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const dateContext = { in: tz(resolvedTimeZone) };
  const isToday = isSameDay(date, TZDate.tz(resolvedTimeZone), dateContext);

  return (
    <div className="sticky top-0 z-20 flex h-7 w-full shrink-0 items-center justify-center gap-1 border-b bg-sidebar px-1">
      <span className="flex shrink-0 items-center gap-1">
        <span
          className={cn(
            "text-[10px] font-medium",
            isToday ? "text-primary" : "text-muted-foreground",
          )}
        >
          {format(date, "EEE", { locale: dateLocale, ...dateContext })}
        </span>
        {!onlyDay && (
          <span
            className={cn(
              "text-[10px] font-medium",
              isToday ? "text-primary font-bold" : "text-foreground",
            )}
          >
            {format(date, "dd", { locale: dateLocale, ...dateContext })}
          </span>
        )}
      </span>
      <CalendarClosureBadge closures={closures} compact />
    </div>
  );
}
