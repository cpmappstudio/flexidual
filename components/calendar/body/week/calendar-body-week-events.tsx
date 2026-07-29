import { useCalendarContext } from "../../calendar-context";
import { startOfWeek, endOfWeek, isWithinInterval, format } from "date-fns";
import { tz } from "@date-fns/tz";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { getCalendarColorClasses } from "../../calendar-tailwind-classes";
import { getCalendarEventDisplay } from "../../calendar-event-display";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

export default function CalendarBodyWeekEvents() {
  const {
    events,
    date,
    displayTimeZone,
    setManageEventDialogOpen,
    setSelectedEvent,
  } = useCalendarContext();

  const t = useTranslations("calendar");
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;

  const dateContext = { in: tz(displayTimeZone) };
  const weekStart = startOfWeek(date, {
    weekStartsOn: 1,
    ...dateContext,
  });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1, ...dateContext });

  const weekEvents = events.filter((event) =>
    isWithinInterval(
      event.start,
      { start: weekStart, end: weekEnd },
      dateContext,
    ),
  );

  return !!weekEvents.length ? (
    <div className="flex flex-col gap-2">
      <p className="font-medium p-2 pb-0 font-heading">{t("eventsThisWeek")}</p>
      <div className="flex flex-col gap-2">
        {weekEvents.map((event) => {
          const { primaryLabel, secondaryLabel } =
            getCalendarEventDisplay(event);
          const timeLabel = `${format(event.start, "h:mm a", dateContext)} - ${format(event.end, "h:mm a", dateContext)}`;

          return (
            <div
              key={event.id}
              className="flex items-center gap-2 px-2 cursor-pointer hover:bg-muted/50 rounded-md py-1 transition-colors"
              onClick={() => {
                setSelectedEvent(event);
                setManageEventDialogOpen(true);
              }}
            >
              <div
                className={`size-2 shrink-0 rounded-full ${getCalendarColorClasses(event.color).dot}`}
              />
              <div className="flex flex-col min-w-0">
                <p className="truncate text-xs font-semibold">{primaryLabel}</p>
                {secondaryLabel && (
                  <p className="truncate text-[11px] font-medium text-muted-foreground">
                    {secondaryLabel}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/80">
                  {format(event.start, "EEE, MMM d", {
                    locale: dateLocale,
                    ...dateContext,
                  })}{" "}
                  · {timeLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="p-2 text-muted-foreground">{t("noEventsThisWeek")}</div>
  );
}
