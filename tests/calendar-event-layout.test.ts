import assert from "node:assert/strict";
import test from "node:test";
import { getCalendarEventColumnLayout } from "../components/calendar/calendar-event-layout";

function event(id: string, start: string, end: string) {
  return { id, start: new Date(start), end: new Date(end) };
}

test("events with the same start use different columns", () => {
  const events = [
    event("a", "2026-07-30T08:00:00-05:00", "2026-07-30T08:45:00-05:00"),
    event("b", "2026-07-30T08:00:00-05:00", "2026-07-30T09:00:00-05:00"),
  ];

  assert.deepEqual(getCalendarEventColumnLayout(events[0], events), {
    columnIndex: 0,
    columnCount: 2,
  });
  assert.deepEqual(getCalendarEventColumnLayout(events[1], events), {
    columnIndex: 1,
    columnCount: 2,
  });
});

test("connected overlaps share a stable number of columns", () => {
  const events = [
    event("a", "2026-07-30T08:00:00-05:00", "2026-07-30T09:00:00-05:00"),
    event("b", "2026-07-30T08:30:00-05:00", "2026-07-30T09:30:00-05:00"),
    event("c", "2026-07-30T09:00:00-05:00", "2026-07-30T10:00:00-05:00"),
  ];

  assert.deepEqual(getCalendarEventColumnLayout(events[0], events), {
    columnIndex: 0,
    columnCount: 2,
  });
  assert.deepEqual(getCalendarEventColumnLayout(events[1], events), {
    columnIndex: 1,
    columnCount: 2,
  });
  assert.deepEqual(getCalendarEventColumnLayout(events[2], events), {
    columnIndex: 0,
    columnCount: 2,
  });
});

test("events that only touch remain full width", () => {
  const events = [
    event("a", "2026-07-30T08:00:00-05:00", "2026-07-30T08:45:00-05:00"),
    event("b", "2026-07-30T08:45:00-05:00", "2026-07-30T09:30:00-05:00"),
  ];

  assert.deepEqual(getCalendarEventColumnLayout(events[0], events), {
    columnIndex: 0,
    columnCount: 1,
  });
  assert.deepEqual(getCalendarEventColumnLayout(events[1], events), {
    columnIndex: 0,
    columnCount: 1,
  });
});
