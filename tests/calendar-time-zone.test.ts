import assert from "node:assert/strict";
import test from "node:test";
import {
  getCalendarUtcRange,
  resolveCalendarTimeZones,
} from "../lib/calendar-time-zone";
import { dateInTimeZone, getUtcDayRange } from "../lib/time-zone";

test("campus administrators use the campus zone instead of the browser zone", () => {
  assert.deepEqual(
    resolveCalendarTimeZones({
      scopeType: "campus",
      institutionTimeZone: "America/New_York",
      campusTimeZone: "America/Bogota",
      isStudent: false,
      browserTimeZone: "Europe/Madrid",
    }),
    {
      schedulingTimeZone: "America/Bogota",
      displayTimeZone: "America/Bogota",
      isUsingLocalTime: false,
    },
  );
});

test("institution administrators use the institution zone", () => {
  assert.deepEqual(
    resolveCalendarTimeZones({
      scopeType: "institution",
      institutionTimeZone: "America/New_York",
      campusTimeZone: "America/Bogota",
      isStudent: false,
      browserTimeZone: "Europe/Madrid",
    }),
    {
      schedulingTimeZone: "America/New_York",
      displayTimeZone: "America/New_York",
      isUsingLocalTime: false,
    },
  );
});

test("students use a valid browser zone and retain the campus scheduling zone", () => {
  assert.deepEqual(
    resolveCalendarTimeZones({
      scopeType: "campus",
      institutionTimeZone: "America/New_York",
      campusTimeZone: "America/Bogota",
      isStudent: true,
      browserTimeZone: "Europe/Madrid",
    }),
    {
      schedulingTimeZone: "America/Bogota",
      displayTimeZone: "Europe/Madrid",
      isUsingLocalTime: true,
    },
  );
});

test("students fall back to the campus zone when browser detection is invalid", () => {
  assert.deepEqual(
    resolveCalendarTimeZones({
      scopeType: "campus",
      institutionTimeZone: "America/New_York",
      campusTimeZone: "America/Bogota",
      isStudent: true,
      browserTimeZone: "Invalid/Zone",
    }),
    {
      schedulingTimeZone: "America/Bogota",
      displayTimeZone: "America/Bogota",
      isUsingLocalTime: false,
    },
  );
});

test("students do not see a local-time indicator in the campus zone", () => {
  assert.deepEqual(
    resolveCalendarTimeZones({
      scopeType: "campus",
      institutionTimeZone: "America/New_York",
      campusTimeZone: "America/Bogota",
      isStudent: true,
      browserTimeZone: "America/Bogota",
    }),
    {
      schedulingTimeZone: "America/Bogota",
      displayTimeZone: "America/Bogota",
      isUsingLocalTime: false,
    },
  );
});

test("a local day range uses the selected display zone", () => {
  const range = getUtcDayRange("2026-07-23", "America/Bogota");
  assert.equal(new Date(range.from).toISOString(), "2026-07-23T05:00:00.000Z");
  assert.equal(new Date(range.to).toISOString(), "2026-07-24T05:00:00.000Z");
});

test("day ranges follow DST instead of assuming twenty-four hours", () => {
  const range = getUtcDayRange("2026-03-08", "America/New_York");
  assert.equal(range.to - range.from, 23 * 60 * 60 * 1000);
});

test("the same instant belongs to the viewer's local calendar day", () => {
  const instant = Date.parse("2026-07-24T03:00:00.000Z");
  assert.equal(dateInTimeZone(instant, "America/Bogota"), "2026-07-23");
  assert.equal(dateInTimeZone(instant, "Europe/Madrid"), "2026-07-24");
});

test("calendar weeks run from Monday to the following Monday", () => {
  const range = getCalendarUtcRange("2026-07-23", "week", "America/Bogota");
  assert.equal(range.startDate, "2026-07-20");
  assert.equal(range.endDate, "2026-07-27");
  assert.equal(new Date(range.from).toISOString(), "2026-07-20T05:00:00.000Z");
  assert.equal(new Date(range.to).toISOString(), "2026-07-27T05:00:00.000Z");
});

test("calendar month ranges include complete visible weeks", () => {
  const range = getCalendarUtcRange("2026-07-23", "month", "America/Bogota");
  assert.equal(range.startDate, "2026-06-29");
  assert.equal(range.endDate, "2026-08-03");
});
