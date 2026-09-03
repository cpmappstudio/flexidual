import { useTranslations } from "next-intl";
import { CalendarAgendaEvent } from "../../calendar-agenda-event";
import type { CalendarEvent } from "../../calendar-types";

export default function CalendarBodyDayEvents({
  events,
}: {
  events: CalendarEvent[];
}) {
  const t = useTranslations("calendar");

  return !!events.length ? (
    <div className="flex flex-col gap-2">
      <p className="font-medium p-2 pb-0 font-heading">{t("eventsToday")}</p>
      <div className="flex flex-col gap-2 p-2 pt-0">
        {events.map((event) => (
          <CalendarAgendaEvent key={event.id} event={event} />
        ))}
      </div>
    </div>
  ) : (
    <div className="p-2 text-muted-foreground">{t("noEventsToday")}</div>
  );
}
