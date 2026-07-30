import { isSameDay } from "date-fns";
import { useCalendarContext } from "../../calendar-context";
import CalendarEvent from "../../calendar-event";
import { CalendarTimeGridDay } from "../week/calendar-week-time-grid";
import { CalendarEvent as CalendarEventType } from "../../calendar-types";
import { CalendarTimeScale } from "../../calendar-time-scale";
import { tz } from "@date-fns/tz";

export default function CalendarBodyDayContent({
  date,
  events: providedEvents,
  timeScale,
  compactEvents = false,
  floatingEventTime = false,
  showHeader = true,
  surfaceClassName,
  eventClassName,
  eventContentClassName,
  responsiveCompactEvents = false,
  hideResponsiveEventTime = false,
}: {
  date: Date;
  events?: CalendarEventType[];
  timeScale?: CalendarTimeScale;
  compactEvents?: boolean;
  floatingEventTime?: boolean;
  showHeader?: boolean;
  surfaceClassName?: string;
  eventClassName?: string;
  eventContentClassName?: string;
  responsiveCompactEvents?: boolean;
  hideResponsiveEventTime?: boolean;
}) {
  const { events, scheduleStartMinutes, scheduleEndMinutes, displayTimeZone } =
    useCalendarContext();
  const dayEvents =
    providedEvents ??
    events.filter((event) =>
      isSameDay(event.start, date, { in: tz(displayTimeZone) }),
    );

  return (
    <CalendarTimeGridDay
      date={date}
      startMinutes={scheduleStartMinutes}
      endMinutes={scheduleEndMinutes}
      timeScale={timeScale}
      showHeader={showHeader}
      surfaceProps={{ className: surfaceClassName }}
    >
      {dayEvents.map((event) =>
        responsiveCompactEvents ? (
          <CalendarEvent
            key={event.id}
            event={event}
            timeScale={timeScale}
            responsiveCompact
            hideResponsiveTime={hideResponsiveEventTime}
          />
        ) : (
          <CalendarEvent
            key={event.id}
            event={event}
            className={eventClassName}
            timeScale={timeScale}
            compact={compactEvents}
            floatingTime={floatingEventTime}
            hideResponsiveTime={hideResponsiveEventTime}
            contentClassName={eventContentClassName}
          />
        ),
      )}
    </CalendarTimeGridDay>
  );
}
