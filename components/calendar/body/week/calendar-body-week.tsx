import { useCalendarContext } from "../../calendar-context";
import CalendarBodyDayContent from "../day/calendar-body-day-content";
import CalendarBodyDayCalendar from "../day/calendar-body-day-calendar";
import CalendarBodyWeekEvents from "./calendar-body-week-events";
import { CalendarWeekTimeGrid } from "./calendar-week-time-grid";

export default function CalendarBodyWeek() {
  const { date } = useCalendarContext();

  return (
    <div className="flex h-full divide-x overflow-hidden">
      <CalendarWeekTimeGrid
        date={date}
        initialScrollHour={7}
        renderDayAction={(day) => <CalendarBodyDayContent date={day} />}
      />
      <div className="hidden w-64 flex-col divide-y overflow-hidden lg:flex">
        <CalendarBodyDayCalendar />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CalendarBodyWeekEvents />
        </div>
      </div>
    </div>
  );
}
