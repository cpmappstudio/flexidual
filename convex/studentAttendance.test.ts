import { describe, expect, test } from "vitest";

import {
  getConnectedSecondsWithinSchedule,
  normalizeExcuseReason,
  suggestStudentAttendanceStatus,
} from "./model/studentAttendance";

describe("student attendance policy", () => {
  test("suggests present at or above 75 percent", () => {
    expect(suggestStudentAttendanceStatus(2_700, 3_600)).toBe("present");
    expect(suggestStudentAttendanceStatus(3_600, 3_600)).toBe("present");
  });

  test("suggests partial from 25 percent until before 75 percent", () => {
    expect(suggestStudentAttendanceStatus(900, 3_600)).toBe("partial");
    expect(suggestStudentAttendanceStatus(2_699, 3_600)).toBe("partial");
  });

  test("suggests absent below 25 percent", () => {
    expect(suggestStudentAttendanceStatus(899, 3_600)).toBe("absent");
    expect(suggestStudentAttendanceStatus(0, 3_600)).toBe("absent");
  });

  test("merges overlapping connection intervals inside the scheduled window", () => {
    const start = 1_000_000;
    const end = start + 3_600_000;
    const connectedSeconds = getConnectedSecondsWithinSchedule(
      [
        { joinedAt: start - 60_000, leftAt: start + 600_000 },
        { joinedAt: start + 300_000, leftAt: start + 1_200_000 },
        { joinedAt: end - 300_000, leftAt: end + 60_000 },
      ],
      start,
      end,
      end,
    );
    expect(connectedSeconds).toBe(1_500);
  });

  test("requires and trims a reason only for excused attendance", () => {
    expect(normalizeExcuseReason("excused", "  Medical appointment  ")).toBe(
      "Medical appointment",
    );
    expect(normalizeExcuseReason("present", "Unused")).toBeUndefined();
    expect(() => normalizeExcuseReason("excused", "   ")).toThrow();
  });
});
