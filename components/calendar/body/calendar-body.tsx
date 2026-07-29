import { useRef, type TouchEvent } from "react";
import { useCalendarContext } from "../calendar-context";
import {
  getHorizontalSwipeStep,
  shiftCalendarDate,
} from "../calendar-navigation";
import CalendarBodyDay from "./day/calendar-body-day";
import CalendarBodyWeek from "./week/calendar-body-week";
import CalendarBodyMonth from "./month/calendar-body-month";

export default function CalendarBody() {
  const { mode, date, setDate } = useCalendarContext();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    const step = getHorizontalSwipeStep(start, {
      x: touch.clientX,
      y: touch.clientY,
    });

    if (step) setDate(shiftCalendarDate(date, mode, step));
  };

  return (
    <div
      className="h-full min-h-0 [touch-action:pan-y_pinch-zoom]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      {mode === "day" && <CalendarBodyDay />}
      {mode === "week" && <CalendarBodyWeek />}
      {mode === "month" && <CalendarBodyMonth />}
    </div>
  );
}
