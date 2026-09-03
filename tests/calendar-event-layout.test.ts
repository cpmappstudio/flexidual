import assert from "node:assert/strict";
import test from "node:test";
import {
  getCalendarEventColumnLayouts,
  getMaxCalendarEventConcurrency,
  groupCalendarEventsByDay,
} from "../components/calendar/calendar-event-layout";

function event(id: string, start: string, end: string) {
  return { id, start: new Date(start), end: new Date(end) };
}

test("events with the same start use different columns", () => {
  const events = [
    event("a", "2026-07-30T08:00:00-05:00", "2026-07-30T08:45:00-05:00"),
    event("b", "2026-07-30T08:00:00-05:00", "2026-07-30T09:00:00-05:00"),
  ];

  const layouts = getCalendarEventColumnLayouts(events);
  assert.deepEqual(layouts.get("a"), {
    columnIndex: 0,
    columnCount: 2,
  });
  assert.deepEqual(layouts.get("b"), {
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

  const layouts = getCalendarEventColumnLayouts(events);
  assert.deepEqual(layouts.get("a"), {
    columnIndex: 0,
    columnCount: 2,
  });
  assert.deepEqual(layouts.get("b"), {
    columnIndex: 1,
    columnCount: 2,
  });
  assert.deepEqual(layouts.get("c"), {
    columnIndex: 0,
    columnCount: 2,
  });
});

test("events that only touch remain full width", () => {
  const events = [
    event("a", "2026-07-30T08:00:00-05:00", "2026-07-30T08:45:00-05:00"),
    event("b", "2026-07-30T08:45:00-05:00", "2026-07-30T09:30:00-05:00"),
  ];

  const layouts = getCalendarEventColumnLayouts(events);
  assert.deepEqual(layouts.get("a"), {
    columnIndex: 0,
    columnCount: 1,
  });
  assert.deepEqual(layouts.get("b"), {
    columnIndex: 0,
    columnCount: 1,
  });
});

test("events are grouped and ordered in the displayed time zone", () => {
  const events = [
    event("later", "2026-07-30T03:30:00Z", "2026-07-30T04:00:00Z"),
    event("earlier", "2026-07-30T02:30:00Z", "2026-07-30T03:00:00Z"),
    event("next-day", "2026-07-30T06:00:00Z", "2026-07-30T06:30:00Z"),
  ];

  const groups = groupCalendarEventsByDay(events, "America/Bogota");
  assert.deepEqual(
    groups.get("2026-07-29")?.map(({ id }) => id),
    ["earlier", "later"],
  );
  assert.deepEqual(
    groups.get("2026-07-30")?.map(({ id }) => id),
    ["next-day"],
  );
});

test("production-sized calendar fixtures are laid out in one batch", () => {
  const events = Array.from({ length: 6 }).flatMap((_, week) =>
    [23, 23, 22, 22, 22].flatMap((count, day) =>
      Array.from({ length: count }, (__, index) => {
        const start = new Date(Date.UTC(2026, 7, 31 + week * 7 + day, 8));
        start.setUTCMinutes(Math.floor(index / 5) * 45);
        const end = new Date(start.getTime() + 40 * 60_000);
        return { id: `${week}-${day}-${index}`, start, end };
      }),
    ),
  );

  assert.equal(events.length, 672);
  assert.equal(getCalendarEventColumnLayouts(events).size, 672);
  assert.equal(getMaxCalendarEventConcurrency(events), 5);
});
