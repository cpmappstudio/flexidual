import assert from "node:assert/strict";
import test from "node:test";
import {
  getRemovedWeeklyScheduleSlots,
  hasAcademicPeriodStarted,
  requiresWeeklySlotRemovalConfirmation,
  scheduleMatchesWeeklySlot,
} from "../lib/course-schedule-change";
import { localDateTimeToUtc } from "../lib/time-zone";

const mondaySlot = {
  dayOfWeek: 1,
  startMinutes: 9 * 60,
  durationMinutes: 60,
  sessionType: "live",
};

test("identifies only weekly blocks removed from the baseline", () => {
  const thursdaySlot = { ...mondaySlot, dayOfWeek: 4 };
  assert.deepEqual(
    getRemovedWeeklyScheduleSlots([mondaySlot, thursdaySlot], [thursdaySlot]),
    [mondaySlot],
  );
});

test("uses the institution time zone to determine whether the period started", () => {
  assert.equal(
    hasAcademicPeriodStarted(
      "2026-08-20",
      "America/Bogota",
      localDateTimeToUtc("2026-08-19T23:59", "America/Bogota"),
    ),
    false,
  );
  assert.equal(
    hasAcademicPeriodStarted(
      "2026-08-20",
      "America/Bogota",
      localDateTimeToUtc("2026-08-20T00:00", "America/Bogota"),
    ),
    true,
  );
});

test("matches an occurrence to its weekly block in local time", () => {
  assert.equal(
    scheduleMatchesWeeklySlot(
      {
        scheduledStart: localDateTimeToUtc(
          "2026-08-24T09:00",
          "America/Bogota",
        ),
        scheduledEnd: localDateTimeToUtc("2026-08-24T10:00", "America/Bogota"),
        sessionType: "live",
      },
      mondaySlot,
      "America/Bogota",
    ),
    true,
  );
});

test("confirms removal only for an existing block in an active period", () => {
  const now = localDateTimeToUtc("2026-08-20T12:00", "America/Bogota");
  assert.equal(
    requiresWeeklySlotRemovalConfirmation({
      slot: mondaySlot,
      originalSlots: [mondaySlot],
      periodStartDate: "2026-08-03",
      timeZone: "America/Bogota",
      isEditing: true,
      now,
    }),
    true,
  );
  assert.equal(
    requiresWeeklySlotRemovalConfirmation({
      slot: { ...mondaySlot, dayOfWeek: 2 },
      originalSlots: [mondaySlot],
      periodStartDate: "2026-08-03",
      timeZone: "America/Bogota",
      isEditing: true,
      now,
    }),
    false,
  );
  assert.equal(
    requiresWeeklySlotRemovalConfirmation({
      slot: mondaySlot,
      originalSlots: [mondaySlot],
      periodStartDate: "2026-09-01",
      timeZone: "America/Bogota",
      isEditing: true,
      now,
    }),
    false,
  );
});
