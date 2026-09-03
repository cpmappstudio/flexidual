import CalendarBodyDayCalendar from "./calendar-body-day-calendar";
import CalendarBodyDayEvents from "./calendar-body-day-events";
import { useCalendarContext } from "../../calendar-context";
import CalendarBodyDayContent from "./calendar-body-day-content";
import CalendarBodyMarginDayMargin from "./calendar-body-margin-day-margin";
import { buildCompressedDayTimeScale } from "../../calendar-time-scale";
import { useMemo } from "react";
import {
  getCalendarEventDayKey,
  groupCalendarEventsByDay,
} from "../../calendar-event-layout";

export default function CalendarBodyDay() {
  const {
    date,
    events,
    scheduleStartMinutes,
    scheduleEndMinutes,
    displayTimeZone,
    isStudent,
  } = useCalendarContext();
  const eventsByDay = useMemo(
    () => groupCalendarEventsByDay(events, displayTimeZone),
    [displayTimeZone, events],
  );
  const dayEvents =
    eventsByDay.get(getCalendarEventDayKey(date, displayTimeZone)) ?? [];
  const timeScale = isStudent
    ? buildCompressedDayTimeScale({
        events: dayEvents,
        startMinutes: scheduleStartMinutes,
        endMinutes: scheduleEndMinutes,
      })
    : undefined;

  return (
    <div className="flex h-full divide-x overflow-hidden [--calendar-hour-height:4rem] xl:[--calendar-hour-height:5rem] 2xl:[--calendar-hour-height:6rem]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="relative flex min-h-full divide-x">
            <CalendarBodyMarginDayMargin
              startMinutes={scheduleStartMinutes}
              endMinutes={scheduleEndMinutes}
              timeScale={timeScale}
            />
            <CalendarBodyDayContent
              date={date}
              events={dayEvents}
              timeScale={timeScale}
              responsiveCompactEvents
              hideResponsiveEventTime
            />
          </div>
        </div>
      </div>
      <div className="hidden w-64 flex-col divide-y overflow-hidden lg:flex">
        <CalendarBodyDayCalendar compact={isStudent} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CalendarBodyDayEvents events={dayEvents} />
        </div>
      </div>
    </div>
  );
}
