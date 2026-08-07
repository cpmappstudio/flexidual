import assert from "node:assert/strict";
import test from "node:test";
import { isCalendarEventPast } from "../components/calendar/calendar-event-display";

const now = Date.UTC(2026, 7, 1, 15);

test("an academically ended class remains current while it is canonically live", () => {
  assert.equal(
    isCalendarEventPast(
      { end: new Date(now - 60_000), isLive: true },
      now,
    ),
    false,
  );
});

test("an ended class is past after its live state closes", () => {
  assert.equal(
    isCalendarEventPast(
      { end: new Date(now - 60_000), isLive: false },
      now,
    ),
    true,
  );
});
