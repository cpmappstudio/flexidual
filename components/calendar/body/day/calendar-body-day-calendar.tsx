import { useCalendarContext } from "../../calendar-context";
import { Calendar } from "@/components/ui/calendar";
import { TZDate } from "@date-fns/tz";

export default function CalendarBodyDayCalendar({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { date, setDate, displayTimeZone } = useCalendarContext();
  const selectCalendarDate = (newDate: Date) =>
    setDate(
      new TZDate(
        newDate.getFullYear(),
        newDate.getMonth(),
        newDate.getDate(),
        displayTimeZone,
      ),
    );
  const calendar = (
    <Calendar
      timeZone={displayTimeZone}
      selected={date}
      onSelect={(newDate) => newDate && selectCalendarDate(newDate)}
      mode="single"
      month={date}
      onMonthChange={selectCalendarDate}
    />
  );

  if (compact) {
    return (
      <div className="flex justify-center pt-1">
        <div className="origin-top scale-90 opacity-80">{calendar}</div>
      </div>
    );
  }

  return calendar;
}
