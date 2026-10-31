import { expect, test } from "vitest";
import {
  firstWeeklyDate,
  weeklyDuration,
  weeklyEndTime,
} from "@/lib/event-weekly-schedule";

test("the first session uses the next selected day without changing the range start", () => {
  expect(firstWeeklyDate("2026-10-26", [3, 4])).toBe("2026-10-28");
  expect(firstWeeklyDate("2026-10-29", [3, 4])).toBe("2026-10-29");
  expect(firstWeeklyDate("2026-10-30", [3, 4])).toBe("2026-11-04");
});

test("weekly sessions require a later end time on the same day", () => {
  expect(weeklyDuration("23:00", "01:00")).toBeNull();
  expect(weeklyDuration("09:00", "09:00")).toBeNull();
  expect(weeklyDuration("09:00", "17:00")).toBe(480);
  expect(weeklyEndTime("23:00", 120)).toBe("01:00");
});
