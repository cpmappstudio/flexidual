import { useCalendarContext } from "../../calendar-context";
import { useTranslations } from "next-intl";
import {
  isSameMonth,
  isSameDay,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from "date-fns";
import { tz } from "@date-fns/tz";

export default function CalendarHeaderDateBadge() {
  const { events, date, mode, displayTimeZone } = useCalendarContext();
  const dateContext = { in: tz(displayTimeZone) };
  const t = useTranslations("calendar");

  let filteredEvents = [];

  switch (mode) {
    case "month":
      filteredEvents = events.filter((event) =>
        isSameMonth(event.start, date, dateContext),
      );
      break;
    case "week": {
      const weekStart = startOfWeek(date, {
        weekStartsOn: 1,
        ...dateContext,
      });
      const weekEnd = endOfWeek(date, { weekStartsOn: 1, ...dateContext });
      filteredEvents = events.filter((event) =>
        isWithinInterval(
          event.start,
          { start: weekStart, end: weekEnd },
          dateContext,
        ),
      );
      break;
    }
    case "day":
      filteredEvents = events.filter((event) =>
        isSameDay(event.start, date, dateContext),
      );
      break;
    default:
      filteredEvents = events.filter((event) =>
        isSameMonth(event.start, date, dateContext),
      );
  }

  if (!filteredEvents.length) return null;

  return (
    <div className="whitespace-nowrap rounded-sm border bg-sidebar px-1.5 py-0.5 text-xs">
      {filteredEvents.length}{" "}
      {filteredEvents.length === 1 ? t("event") : t("events")}
    </div>
  );
}
