import { Infer, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  civilDayNumber,
  getWeeklyOccurrenceStarts,
  utcToLocalDateTime,
} from "../../lib/time-zone";

export const courseSessionTypeValidator = v.union(
  v.literal("live"),
  v.literal("ignitia"),
  v.literal("abeka"),
);

export const courseWeeklySlotValidator = v.object({
  dayOfWeek: v.number(),
  startMinutes: v.number(),
  durationMinutes: v.number(),
  sessionType: courseSessionTypeValidator,
});

export type CourseWeeklySlotConfig = Infer<typeof courseWeeklySlotValidator>;

export type PlannedCourseOccurrence = {
  slotIndex: number;
  occurrenceIndex: number;
  dayOfWeek: number;
  start: number;
  end: number;
  sessionType: CourseWeeklySlotConfig["sessionType"];
};

export const MAX_WEEKLY_SLOTS = 14;
export const MAX_OCCURRENCES_PER_SLOT = 60;

export function areWeeklySchedulesEqual(
  left: CourseWeeklySlotConfig[],
  right: CourseWeeklySlotConfig[],
) {
  if (left.length !== right.length) return false;

  const sortSlots = (slots: CourseWeeklySlotConfig[]) =>
    [...slots].sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        a.startMinutes - b.startMinutes ||
        a.durationMinutes - b.durationMinutes ||
        a.sessionType.localeCompare(b.sessionType),
    );
  const sortedLeft = sortSlots(left);
  const sortedRight = sortSlots(right);

  return sortedLeft.every((slot, index) => {
    const other = sortedRight[index];
    return (
      slot.dayOfWeek === other.dayOfWeek &&
      slot.startMinutes === other.startMinutes &&
      slot.durationMinutes === other.durationMinutes &&
      slot.sessionType === other.sessionType
    );
  });
}

export function isValidWeeklySchedule(
  slots: CourseWeeklySlotConfig[],
  scheduleStartMinutes: number,
  scheduleEndMinutes: number,
) {
  return (
    slots.length > 0 &&
    slots.length <= MAX_WEEKLY_SLOTS &&
    slots.every(
      (slot) =>
        Number.isInteger(slot.dayOfWeek) &&
        slot.dayOfWeek >= 0 &&
        slot.dayOfWeek <= 6 &&
        Number.isInteger(slot.startMinutes) &&
        slot.startMinutes >= scheduleStartMinutes &&
        Number.isInteger(slot.durationMinutes) &&
        slot.durationMinutes >= 1 &&
        slot.durationMinutes <= 8 * 60 &&
        slot.startMinutes + slot.durationMinutes <= scheduleEndMinutes,
    )
  );
}

export function planWeeklyCourseOccurrences({
  slots,
  periodStartDate,
  periodEndDate,
  timeZone,
  from,
}: {
  slots: CourseWeeklySlotConfig[];
  periodStartDate: string;
  periodEndDate: string;
  timeZone: string;
  from?: number;
}) {
  return slots.map((slot, slotIndex) =>
    getWeeklyOccurrenceStarts({
      startDate: periodStartDate,
      endDate: periodEndDate,
      timeZone,
      dayOfWeek: slot.dayOfWeek,
      startMinutes: slot.startMinutes,
      limit: MAX_OCCURRENCES_PER_SLOT,
    })
      .filter((start) => from === undefined || start >= from)
      .map((start, occurrenceIndex) => ({
        slotIndex,
        occurrenceIndex,
        dayOfWeek: slot.dayOfWeek,
        start,
        end: start + slot.durationMinutes * 60_000,
        sessionType: slot.sessionType,
      })),
  );
}

export function inferWeeklySchedule(
  schedules: Doc<"classSchedule">[],
  timeZone: string,
) {
  const slots = schedules.flatMap((schedule) => {
    if (!schedule.isRecurring || schedule.recurrenceParentId) return [];

    const localStart = utcToLocalDateTime(schedule.scheduledStart, timeZone);
    const localDate = localStart.slice(0, 10);
    const ruleDay = getRuleDay(schedule.recurrenceRule);

    return [
      {
        dayOfWeek:
          ruleDay ??
          new Date(civilDayNumber(localDate) * 86_400_000).getUTCDay(),
        startMinutes:
          Number(localStart.slice(11, 13)) * 60 +
          Number(localStart.slice(14, 16)),
        durationMinutes: Math.round(
          (schedule.scheduledEnd - schedule.scheduledStart) / 60_000,
        ),
        sessionType: schedule.sessionType ?? ("live" as const),
      },
    ];
  });

  return slots.sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes,
  );
}

function getRuleDay(rule?: string) {
  if (!rule) return undefined;
  try {
    const value: unknown = JSON.parse(rule);
    if (!value || typeof value !== "object") return undefined;
    const days = (value as { daysOfWeek?: unknown }).daysOfWeek;
    if (!Array.isArray(days) || !Number.isInteger(days[0])) return undefined;
    const day = days[0] as number;
    return day >= 0 && day <= 6 ? day : undefined;
  } catch {
    return undefined;
  }
}
