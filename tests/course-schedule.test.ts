import assert from "node:assert/strict";
import test from "node:test";
import { isValidWeeklySchedule } from "../convex/model/courseSchedule";

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
