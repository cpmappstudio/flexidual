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

test("weekly course schedules support five-minute precision", () => {
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60 + 5, 5),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    true,
  );
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60 + 10, 10),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    true,
  );
});

test("weekly course schedules reject times outside five-minute precision", () => {
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60 + 1, 5),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    false,
  );
  assert.equal(
    isValidWeeklySchedule(
      slot(8 * 60, 6),
      scheduleStartMinutes,
      scheduleEndMinutes,
    ),
    false,
  );
});
