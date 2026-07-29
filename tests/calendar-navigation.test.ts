import assert from "node:assert/strict";
import test from "node:test";
import {
  getHorizontalSwipeStep,
  shiftCalendarDate,
} from "../components/calendar/calendar-navigation";

test("horizontal swipes navigate while vertical gestures keep scrolling", () => {
  assert.equal(getHorizontalSwipeStep({ x: 100, y: 10 }, { x: 20, y: 20 }), 1);
  assert.equal(getHorizontalSwipeStep({ x: 20, y: 10 }, { x: 100, y: 20 }), -1);
  assert.equal(getHorizontalSwipeStep({ x: 20, y: 10 }, { x: 30, y: 90 }), 0);
});

test("calendar navigation follows the active view", () => {
  const date = new Date(2026, 6, 15);

  assert.equal(shiftCalendarDate(date, "day", 1).getDate(), 16);
  assert.equal(shiftCalendarDate(date, "week", -1).getDate(), 8);
  assert.equal(shiftCalendarDate(date, "month", 1).getMonth(), 7);
});
