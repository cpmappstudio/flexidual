import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  addCivilDays,
  dateInTimeZone,
  getUtcDayStart,
  isValidTimeZone,
  mondayOfCivilWeek,
  toCivilDate,
} from "../../lib/time-zone";
import { isExternalClassSession } from "../../lib/class-session";
import { verifiedAttendanceCourse } from "./studentAttendance";

export function weeklySessionCategory(session: Doc<"classSchedule"> | null) {
  if (!session || isExternalClassSession(session.sessionType)) return null;
  if (session.status === "cancelled") return "cancelled";
  if (
    session.status === "completed" &&
    session.sessionStartedAt !== undefined &&
    session.completedAt !== undefined &&
    Number.isFinite(session.sessionStartedAt) &&
    Number.isFinite(session.completedAt) &&
    session.completedAt > session.sessionStartedAt
  )
    return "completed";
  if (session.status === "scheduled" && session.sessionStartedAt === undefined)
    return "noStart";
  return "other";
}

export function pendingWeek(
  ctx: Pick<QueryCtx, "db">,
  academicPeriodId: Id<"academicPeriods">,
  weekStart: string,
) {
  return ctx.db
    .query("courseSessionWeekPending")
    .withIndex("by_academicPeriodId_and_weekStart", (q) =>
      q.eq("academicPeriodId", academicPeriodId).eq("weekStart", weekStart),
    )
    .unique();
}

function insertPendingWeek(
  ctx: MutationCtx,
  academicPeriodId: Id<"academicPeriods">,
  weekStart: string,
  timeZone: string,
) {
  return ctx.db.insert("courseSessionWeekPending", {
    academicPeriodId,
    weekStart,
    availableAt: getUtcDayStart(addCivilDays(weekStart, 7), timeZone),
  });
}

export function periodWeekRange(period: Doc<"academicPeriods">) {
  return {
    first: mondayOfCivilWeek(toCivilDate(period.startDate)),
    last: mondayOfCivilWeek(toCivilDate(period.endDate)),
  };
}

// Only read summary metadata; an existing pending week is never reset.
export async function queuePeriodWeeks(
  ctx: MutationCtx,
  period: Doc<"academicPeriods">,
  timeZone: string,
  previousPeriod?: Doc<"academicPeriods">,
) {
  const { first, last } = periodWeekRange(period);
  const refreshes = await ctx.db
    .query("courseSessionWeekRefreshes")
    .withIndex("by_academicPeriodId_and_weekStart", (q) =>
      q
        .eq("academicPeriodId", period._id)
        .gte("weekStart", first)
        .lte("weekStart", last),
    )
    .collect();
  const pending = await ctx.db
    .query("courseSessionWeekPending")
    .withIndex("by_academicPeriodId_and_weekStart", (q) =>
      q
        .eq("academicPeriodId", period._id)
        .gte("weekStart", first)
        .lte("weekStart", last),
    )
    .collect();
  const ready = new Set(
    refreshes
      .filter((row) => row.timeZone === timeZone && row.attendanceReady)
      .map((row) => row.weekStart),
  );
  const alreadyPending = new Set(pending.map((row) => row.weekStart));
  const bounds = (value: Doc<"academicPeriods">, week: string) => {
    const from = toCivilDate(value.startDate);
    const to = toCivilDate(value.endDate);
    const sunday = addCivilDays(week, 6);
    return `${from > week ? from : week}:${to < sunday ? to : sunday}`;
  };
  for (let week = first; week <= last; week = addCivilDays(week, 7)) {
    const coverageChanged =
      previousPeriod &&
      bounds(previousPeriod, week) !== bounds(period, week);
    if (!alreadyPending.has(week) && (!ready.has(week) || coverageChanged))
      await insertPendingWeek(ctx, period._id, week, timeZone);
  }
}

async function scheduleWeek(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  if (!Number.isFinite(schedule.scheduledStart)) return null;
  const course = await ctx.db.get("classes", schedule.classId);
  if (!course?.academicPeriodId) return null;
  const period = await ctx.db.get("academicPeriods", course.academicPeriodId);
  if (!period) return null;
  const school = await ctx.db.get("schools", period.schoolId);
  if (!school?.timeZone || !isValidTimeZone(school.timeZone)) return null;
  const day = dateInTimeZone(schedule.scheduledStart, school.timeZone);
  if (day < toCivilDate(period.startDate) || day > toCivilDate(period.endDate))
    return null;
  return {
    periodId: period._id,
    week: mondayOfCivilWeek(day),
    timeZone: school.timeZone,
  };
}

async function queueWeeks(
  ctx: MutationCtx,
  weeks: Awaited<ReturnType<typeof scheduleWeek>>[],
) {
  const seen = new Set<string>();
  for (const entry of weeks) {
    if (!entry) continue;
    const { periodId, week, timeZone } = entry;
    const key = `${periodId}:${week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(await pendingWeek(ctx, periodId, week)))
      await insertPendingWeek(ctx, periodId, week, timeZone);
  }
}

export function registerCourseSessionWeekTriggers(
  triggers: Triggers<DataModel>,
) {
  triggers.register("academicPeriods", async (ctx, { oldDoc, newDoc }) => {
    if (
      !newDoc ||
      (oldDoc?.startDate === newDoc.startDate &&
        oldDoc.endDate === newDoc.endDate)
    )
      return;
    const school = await ctx.db.get("schools", newDoc.schoolId);
    if (school?.timeZone && isValidTimeZone(school.timeZone))
      await queuePeriodWeeks(ctx, newDoc, school.timeZone, oldDoc ?? undefined);
  });
  triggers.register("classSchedule", async (ctx, { oldDoc, newDoc }) => {
    const before = weeklySessionCategory(oldDoc);
    const after = weeklySessionCategory(newDoc);
    if (!before && !after) return;
    const moved =
      oldDoc?.classId !== newDoc?.classId ||
      oldDoc?.scheduledStart !== newDoc?.scheduledStart;
    const sameContribution =
      before === after &&
      verifiedAttendanceCourse(oldDoc) === verifiedAttendanceCourse(newDoc);
    if (!moved && sameContribution) return;
    const oldWeek = before && oldDoc ? await scheduleWeek(ctx, oldDoc) : null;
    const newWeek =
      after && newDoc && (!before || moved)
        ? await scheduleWeek(ctx, newDoc)
        : null;
    if (
      sameContribution &&
      oldDoc?.classId === newDoc?.classId &&
      oldWeek?.periodId === newWeek?.periodId &&
      oldWeek?.week === newWeek?.week
    )
      return;
    await queueWeeks(ctx, [oldWeek, newWeek]);
  });
  triggers.register(
    "studentAttendanceRecords",
    async (ctx, { oldDoc, newDoc }) => {
      if (
        oldDoc?.scheduleId === newDoc?.scheduleId &&
        oldDoc?.status === newDoc?.status
      )
        return;
      const weeks = [];
      for (const id of new Set([oldDoc?.scheduleId, newDoc?.scheduleId])) {
        if (!id) continue;
        const schedule = await ctx.db.get("classSchedule", id);
        if (schedule && verifiedAttendanceCourse(schedule))
          weeks.push(await scheduleWeek(ctx, schedule));
      }
      await queueWeeks(ctx, weeks);
    },
  );
}
