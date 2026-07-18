import { isSameDay } from "date-fns";
import { useCalendarContext } from "../../calendar-context";
import CalendarEvent from "../../calendar-event";
import { CalendarTimeGridDay } from "../week/calendar-week-time-grid";

export default function CalendarBodyDayContent({ date }: { date: Date }) {
  const { events } = useCalendarContext();
  const dayEvents = events.filter((event) => isSameDay(event.start, date));

  return (
    <CalendarTimeGridDay date={date}>
      {dayEvents.map((event) => (
        <CalendarEvent key={event.id} event={event} />
      ))}
    </CalendarTimeGridDay>
  );
}
