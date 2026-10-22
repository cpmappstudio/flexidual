import assert from "node:assert/strict";
import test from "node:test";
import { isValidWeeklySchedule } from "../convex/model/courseSchedule";
import { ConvexError } from "convex/values";
import { getErrorMessage, parseConvexError } from "../lib/error-utils";

const scheduleStartMinutes = 8 * 60;
const scheduleEndMinutes = 17 * 60;

function slot(startMinutes: number, durationMinutes: number) {
  return [
    {
      dayOfWeek: 1,
      startMinutes,
      durationMinutes,
      sessionType: "live" as const,
    },
  ];
}

test("weekly course schedules support exact minute precision", () => {
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60 + 1, 1),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    true,
  );
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60 + 7, 43),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    true,
  );
});

test("weekly course schedules reject invalid minute values", () => {
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60, 0),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    false,
  );
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60 + 0.5, 30),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    false,
  );
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60, 30.5),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    false,
  );
  assert.equal(
    isValidWeeklySchedule(
      slot(scheduleEndMinutes - 15, 30),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    false,
  );
});

test("an unchanged weekly block can survive a narrower schedule window", () => {
  const existing = slot(17 * 60 + 25, 30);
  const added = { ...slot(8 * 60, 60)[0], dayOfWeek: 5 };
  assert.equal(
    isValidWeeklySchedule(
      [...existing, added],
      scheduleStartMinutes,
      scheduleEndMinutes,
      existing,
    ),
    true,
  );
  assert.equal(
    isValidWeeklySchedule(existing, scheduleStartMinutes, scheduleEndMinutes),
    false,
  );
  for (const changed of [
    { ...existing[0], dayOfWeek: 2 },
    { ...existing[0], startMinutes: 17 * 60 + 30 },
    { ...existing[0], durationMinutes: 31 },
    { ...existing[0], sessionType: "abeka" as const },
  ])
    assert.equal(
      isValidWeeklySchedule(
        [...existing, changed],
        scheduleStartMinutes,
        scheduleEndMinutes,
        existing,
      ),
      false,
    );
});

test("existing weekly blocks still obey structural safety limits", () => {
  for (const invalid of [
    { ...slot(9 * 60, 60)[0], dayOfWeek: 7 },
    slot(-1, 60)[0],
    slot(9 * 60 + 0.5, 60)[0],
    slot(17 * 60 + 25, 0)[0],
    slot(8 * 60, 8 * 60 + 1)[0],
    slot(23 * 60, 61)[0],
  ])
    assert.equal(
      isValidWeeklySchedule(
        [invalid],
        scheduleStartMinutes,
        scheduleEndMinutes,
        [invalid],
      ),
      false,
    );
  const tooMany = Array.from({ length: 15 }, () => slot(9 * 60, 60)[0]);
  assert.equal(
    isValidWeeklySchedule(
      tooMany,
      scheduleStartMinutes,
      scheduleEndMinutes,
      tooMany,
    ),
    false,
  );
});

test("weekly schedule validation errors have a user-facing explanation", () => {
  const error = parseConvexError(new ConvexError("INVALID_WEEKLY_SCHEDULE"));
  assert.equal(error?.code, "INVALID_WEEKLY_SCHEDULE");
  assert.equal(
    getErrorMessage(error!, (key) => key),
    "class.invalidScheduleTime",
  );
});
