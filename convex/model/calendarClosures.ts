import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const CALENDAR_CLOSURE_BATCH_SIZE = 20;

export type CalendarClosureOverlap = "contained" | "partial" | "none";

export function classifyCalendarClosureOverlap(
  schedule: Pick<Doc<"classSchedule">, "scheduledStart" | "scheduledEnd">,
  closure: Pick<Doc<"calendarClosures">, "startsAt" | "endsAt">,
): CalendarClosureOverlap {
  const overlaps =
    schedule.scheduledStart < closure.endsAt &&
    schedule.scheduledEnd > closure.startsAt;
  if (!overlaps) return "none";

  return schedule.scheduledStart >= closure.startsAt &&
    schedule.scheduledEnd <= closure.endsAt
    ? "contained"
    : "partial";
}

export function calendarClosureMatchesClass(
  closure: Pick<Doc<"calendarClosures">, "schoolId" | "campusId" | "gradeCode">,
  classData: Pick<Doc<"classes">, "schoolId" | "campusId" | "gradeCode">,
  fallbackSchoolId?: Id<"schools">,
) {
  return (
    (classData.schoolId ?? fallbackSchoolId) === closure.schoolId &&
    (!closure.campusId || classData.campusId === closure.campusId) &&
    (!closure.gradeCode || classData.gradeCode === closure.gradeCode)
  );
}

export async function listApplicableCalendarClosures(
  ctx: QueryCtx | MutationCtx,
  {
    schoolId,
    campusId,
    gradeCode,
    from,
    to,
  }: {
    schoolId: Id<"schools">;
    campusId?: Id<"campuses">;
    gradeCode?: string;
    from: number;
    to: number;
  },
) {
  const closures = await ctx.db
    .query("calendarClosures")
    .withIndex("by_school_and_starts_at", (query) =>
      query
        .eq("schoolId", schoolId)
        .gte("startsAt", from - DAY_MS)
        .lt("startsAt", to),
    )
    .take(500);

  return closures.filter(
    (closure) =>
      closure.endsAt > from &&
      (!closure.campusId || closure.campusId === campusId) &&
      (!closure.gradeCode || closure.gradeCode === gradeCode),
  );
}

export function findContainingCalendarClosure(
  schedule: Pick<Doc<"classSchedule">, "scheduledStart" | "scheduledEnd">,
  closures: Doc<"calendarClosures">[],
) {
  return closures.find(
    (closure) =>
      classifyCalendarClosureOverlap(schedule, closure) === "contained",
  );
}

export async function getCalendarClosureOccurrence(
  ctx: QueryCtx | MutationCtx,
  closureId: Id<"calendarClosures">,
  scheduleId: Id<"classSchedule">,
) {
  return await ctx.db
    .query("calendarClosureOccurrences")
    .withIndex("by_closure_and_schedule", (query) =>
      query.eq("closureId", closureId).eq("scheduleId", scheduleId),
    )
    .unique();
}
