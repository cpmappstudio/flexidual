import { v } from "convex/values";

export const studentAttendanceStatusValidator = v.union(
  v.literal("present"),
  v.literal("partial"),
  v.literal("absent"),
  v.literal("excused"),
);

export type StudentAttendanceStatus =
  | "present"
  | "partial"
  | "absent"
  | "excused";

export const PRESENT_ATTENDANCE_RATIO = 0.75;
export const PARTIAL_ATTENDANCE_RATIO = 0.25;

interface ConnectionInterval {
  joinedAt: number;
  leftAt?: number;
}

export function getConnectedSecondsWithinSchedule(
  intervals: ConnectionInterval[],
  scheduledStart: number,
  scheduledEnd: number,
  now: number,
) {
  const boundedIntervals = intervals
    .map((interval) => ({
      start: Math.max(interval.joinedAt, scheduledStart),
      end: Math.min(interval.leftAt ?? now, scheduledEnd),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let totalMilliseconds = 0;
  let currentStart: number | undefined;
  let currentEnd: number | undefined;

  for (const interval of boundedIntervals) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }
    totalMilliseconds += currentEnd - currentStart;
    currentStart = interval.start;
    currentEnd = interval.end;
  }

  if (currentStart !== undefined && currentEnd !== undefined) {
    totalMilliseconds += currentEnd - currentStart;
  }

  return totalMilliseconds / 1000;
}

export function suggestStudentAttendanceStatus(
  connectedSeconds: number,
  scheduledDurationSeconds: number,
): Exclude<StudentAttendanceStatus, "excused"> {
  const ratio =
    scheduledDurationSeconds > 0
      ? connectedSeconds / scheduledDurationSeconds
      : 0;
  if (ratio >= PRESENT_ATTENDANCE_RATIO) return "present";
  if (ratio >= PARTIAL_ATTENDANCE_RATIO) return "partial";
  return "absent";
}

export function normalizeExcuseReason(
  status: StudentAttendanceStatus,
  excuseReason?: string,
) {
  if (status !== "excused") return undefined;
  const normalizedReason = excuseReason?.trim();
  if (!normalizedReason) {
    throw new Error("An excuse reason is required for excused attendance");
  }
  return normalizedReason;
}
