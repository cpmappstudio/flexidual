import { addDays, addMonths, addWeeks } from "date-fns";
import type { Mode } from "./calendar-types";

type TouchPoint = { x: number; y: number };

export function shiftCalendarDate(date: Date, mode: Mode, amount: number) {
  if (mode === "month") return addMonths(date, amount);
  if (mode === "week") return addWeeks(date, amount);
  return addDays(date, amount);
}

export function getHorizontalSwipeStep(
  start: TouchPoint,
  end: TouchPoint,
  minimumDistance = 50,
): -1 | 0 | 1 {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (
    Math.abs(deltaX) < minimumDistance ||
    Math.abs(deltaX) <= Math.abs(deltaY)
  ) {
    return 0;
  }

  return deltaX < 0 ? 1 : -1;
}
