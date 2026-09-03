import { addDays, format, startOfWeek } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { tz } from "@date-fns/tz";
import { useLocale, useTranslations } from "next-intl";

import { CalendarAgendaEvent } from "../../calendar-agenda-event";
import { useCalendarContext } from "../../calendar-context";
import { getCalendarEventDayKey } from "../../calendar-event-layout";
import type { CalendarEvent } from "../../calendar-types";

const localeMap = {
  en: enUS,
  es,
  "pt-BR": ptBR,
} as const;

export function CalendarBodyWeekDaySummary({
  events,
}: {
  events: CalendarEvent[];
}) {
  const t = useTranslations("calendar");

  return (
    <div className="space-y-1.5 p-1.5">
      {events.length > 0 ? (
        events.map((event) => (
          <CalendarAgendaEvent key={event.id} event={event} />
        ))
      ) : (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {t("noEventsDay")}
        </p>
      )}
    </div>
  );
}

export default function CalendarBodyWeekSummary({
  eventsByDay,
}: {
  eventsByDay: Map<string, CalendarEvent[]>;
}) {
  const { date, displayTimeZone } = useCalendarContext();
  const locale = useLocale();
  const t = useTranslations("calendar");
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const dateContext = { in: tz(displayTimeZone) };
  const weekStart = startOfWeek(date, {
    weekStartsOn: 1,
    ...dateContext,
  });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index, dateContext),
  );
  return (
    <div className="h-full overflow-auto overscroll-contain bg-sidebar">
      <div className="grid min-h-full min-w-[70rem] grid-cols-7 divide-x">
        {weekDays.map((day) => {
          const key = getCalendarEventDayKey(day, displayTimeZone);
          const dayEvents = eventsByDay.get(key) ?? [];

          return (
            <section key={key} className="min-w-0">
              <header className="sticky top-0 z-10 border-b bg-sidebar px-2 py-2 text-center">
                <p className="text-xs font-semibold capitalize text-foreground">
                  {format(day, "EEE d", {
                    locale: dateLocale,
                    ...dateContext,
                  })}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {dayEvents.length}{" "}
                  {dayEvents.length === 1 ? t("event") : t("events")}
                </p>
              </header>
              <CalendarBodyWeekDaySummary events={dayEvents} />
            </section>
          );
        })}
      </div>
    </div>
  );
}
