import assert from "node:assert/strict";
import test from "node:test";
import {
  getWeeklyOccurrenceStarts,
  localDateTimeToUtc,
  shiftZonedDateTime,
  utcToLocalDateTime,
} from "../lib/time-zone";

test("IANA zones apply DST rules instead of freezing an offset", () => {
  assert.equal(
    new Date(
      localDateTimeToUtc("2026-01-12T08:00", "America/New_York"),
    ).toISOString(),
    "2026-01-12T13:00:00.000Z",
  );
  assert.equal(
    new Date(
      localDateTimeToUtc("2026-07-13T08:00", "America/New_York"),
    ).toISOString(),
    "2026-07-13T12:00:00.000Z",
  );
  assert.equal(
    new Date(
      localDateTimeToUtc("2026-07-13T08:00", "America/Tegucigalpa"),
    ).toISOString(),
    "2026-07-13T14:00:00.000Z",
  );
});

test("academic period boundaries convert at midnight in the Convex runtime path", () => {
  assert.equal(
    new Date(
      localDateTimeToUtc("2026-10-01T00:00", "America/Bogota"),
    ).toISOString(),
    "2026-10-01T05:00:00.000Z",
  );
});

test("nonexistent civil times are rejected during a DST transition", () => {
  assert.throws(
    () => localDateTimeToUtc("2026-03-08T02:30", "America/New_York"),
    /INVALID_LOCAL_DATE_TIME/,
  );
});

test("weekly occurrences retain 8 AM when New York enters DST", () => {
  const starts = getWeeklyOccurrenceStarts({
    startDate: "2026-03-01",
    endDate: "2026-03-16",
    timeZone: "America/New_York",
    dayOfWeek: 1,
    startMinutes: 8 * 60,
    limit: 10,
  });
  assert.deepEqual(
    starts.map((start) => utcToLocalDateTime(start, "America/New_York")),
    ["2026-03-02T08:00", "2026-03-09T08:00", "2026-03-16T08:00"],
  );
  assert.equal(starts[1] - starts[0], 167 * 60 * 60 * 1000);
});

test("rescheduling a series preserves its civil time across DST", () => {
  const winter = localDateTimeToUtc("2026-03-02T08:00", "America/New_York");
  const followingWeek = shiftZonedDateTime(winter, "America/New_York", 7, 8, 0);
  assert.equal(
    utcToLocalDateTime(followingWeek, "America/New_York"),
    "2026-03-09T08:00",
  );
  assert.equal(followingWeek - winter, 167 * 60 * 60 * 1000);
});
