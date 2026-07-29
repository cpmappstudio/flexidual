import { format } from "date-fns";
import { TZDate, tz } from "@date-fns/tz";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import {
  CalendarTimeScale,
  getTimeScalePercent,
} from "../../calendar-time-scale";
import { useOptionalCalendarContext } from "../../calendar-context";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

export const hours = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarBodyMarginDayMargin({
  className,
  startMinutes = 0,
  endMinutes = 24 * 60,
  timeScale,
  showHeader = true,
  displayTimeZone,
}: {
  className?: string;
  startMinutes?: number;
  endMinutes?: number;
  timeScale?: CalendarTimeScale;
  showHeader?: boolean;
  displayTimeZone?: string;
}) {
  const calendarContext = useOptionalCalendarContext();
  const resolvedTimeZone = displayTimeZone ?? calendarContext?.displayTimeZone;
  if (!resolvedTimeZone) {
    throw new Error("CalendarBodyMarginDayMargin requires a display time zone");
  }
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const durationMinutes = endMinutes - startMinutes;
  const markers = hours.filter((hour) => {
    const minutes = hour * 60;
    return minutes > startMinutes && minutes < endMinutes;
  });

  return (
    <div
      className={cn(
        "sticky left-0 z-10 flex w-16 shrink-0 flex-col bg-sidebar xl:w-20",
        className,
      )}
    >
      {showHeader && (
        <div className="sticky top-0 left-0 z-20 h-7 border-b bg-sidebar" />
      )}
      <div
        className="relative"
        style={{
          height: timeScale
            ? `calc(var(--calendar-hour-height) * ${timeScale.totalUnits})`
            : `calc(var(--calendar-hour-height) * ${durationMinutes / 60})`,
        }}
      >
        {markers.map((hour) => (
          <span
            key={hour}
            className="absolute left-1 -translate-y-1/2 text-xs text-muted-foreground xl:left-2 xl:text-sm"
            style={{
              top: timeScale
                ? `${getTimeScalePercent(timeScale, hour * 60)}%`
                : `${((hour * 60 - startMinutes) / durationMinutes) * 100}%`,
            }}
          >
            {format(TZDate.tz(resolvedTimeZone, 2024, 0, 1, hour), "h a", {
              locale: dateLocale,
              in: tz(resolvedTimeZone),
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
