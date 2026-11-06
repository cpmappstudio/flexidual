import { DirectAggregate } from "@convex-dev/aggregate";
import type { Triggers } from "convex-helpers/server/triggers";
import { components } from "../_generated/api";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isExternalClassSession } from "../../lib/class-session";

// Namespaces isolate unrelated courses/students; source data remains authoritative.
export const dashboardAggregate = new DirectAggregate<{
  Key: string[];
  Id: string;
  Namespace: string;
}>(components.dashboardAggregate);

export async function dashboardSummariesEnabled(ctx: QueryCtx) {
  return Boolean(await dashboardSummaryState(ctx));
}
export async function dashboardSummaryState(ctx: QueryCtx) {
  return ctx.db
    .query("dashboardSummaryState")
    .withIndex("by_key", (q) => q.eq("key", "v1"))
    .unique();
}
export async function dashboardSummariesReady(ctx: QueryCtx) {
  return (await dashboardSummaryState(ctx))?.ready === true;
}

function scheduleEntry(schedule: Doc<"classSchedule">) {
  if (
    isExternalClassSession(schedule.sessionType) ||
    schedule.status === "cancelled"
  )
    return null;
  return {
    namespace: `schedules:${schedule.classId}`,
    key: [schedule.status],
    id: schedule._id,
  };
}
function attendanceScope(schedule: Doc<"classSchedule"> | null) {
  return schedule &&
    !isExternalClassSession(schedule.sessionType) &&
    schedule.status === "completed" &&
    schedule.sessionClosureStatus === "completed"
    ? schedule.classId
    : null;
}
function attendanceEntry(
  record: Doc<"studentAttendanceRecords">,
  schedule: Doc<"classSchedule"> | null,
) {
  if (
    !schedule ||
    isExternalClassSession(schedule.sessionType) ||
    schedule.status !== "completed" ||
    schedule.sessionClosureStatus !== "completed"
  )
    return null;
  return {
    namespace: `attendance:${record.studentId}:${schedule.classId}`,
    key: [record.status],
    id: record._id,
  };
}
export async function syncDashboardSchedule(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  const entry = scheduleEntry(schedule);
  if (entry) await dashboardAggregate.insertIfDoesNotExist(ctx, entry);
}
export async function syncDashboardAttendance(
  ctx: MutationCtx,
  record: Doc<"studentAttendanceRecords">,
) {
  const schedule = await ctx.db.get("classSchedule", record.scheduleId);
  const entry = attendanceEntry(record, schedule);
  if (entry) await dashboardAggregate.insertIfDoesNotExist(ctx, entry);
}

export function registerDashboardAttendanceTriggers(
  triggers: Triggers<DataModel>,
) {
  triggers.register("classSchedule", async (ctx, change) => {
    const before = change.oldDoc && scheduleEntry(change.oldDoc);
    const after = change.newDoc && scheduleEntry(change.newDoc);
    if (
      (JSON.stringify(before) === JSON.stringify(after) &&
        attendanceScope(change.oldDoc) === attendanceScope(change.newDoc)) ||
      !(await dashboardSummariesEnabled(ctx))
    )
      return;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      if (before) await dashboardAggregate.deleteIfExists(ctx, before);
      if (after) await dashboardAggregate.insertIfDoesNotExist(ctx, after);
    }
    if (attendanceScope(change.oldDoc) === attendanceScope(change.newDoc))
      return;
    // Only count-affecting transitions touch attendance. Live heartbeat/leadership
    // writes do not update this aggregate or contend with dashboard readers.
    for await (const record of ctx.db
      .query("studentAttendanceRecords")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", change.id))) {
      const oldEntry = attendanceEntry(record, change.oldDoc);
      const newEntry = attendanceEntry(record, change.newDoc);
      if (JSON.stringify(oldEntry) === JSON.stringify(newEntry)) continue;
      if (oldEntry) await dashboardAggregate.deleteIfExists(ctx, oldEntry);
      if (newEntry)
        await dashboardAggregate.insertIfDoesNotExist(ctx, newEntry);
    }
  });
  triggers.register("studentAttendanceRecords", async (ctx, change) => {
    if (
      change.oldDoc?.studentId === change.newDoc?.studentId &&
      change.oldDoc?.scheduleId === change.newDoc?.scheduleId &&
      change.oldDoc?.status === change.newDoc?.status
    )
      return;
    if (!(await dashboardSummariesEnabled(ctx))) return;
    if (change.oldDoc) {
      const oldEntry = attendanceEntry(
        change.oldDoc,
        await ctx.db.get("classSchedule", change.oldDoc.scheduleId),
      );
      if (oldEntry) await dashboardAggregate.deleteIfExists(ctx, oldEntry);
    }
    if (change.newDoc) await syncDashboardAttendance(ctx, change.newDoc);
  });
}

export async function getDashboardAttendanceStats(
  ctx: QueryCtx,
  studentId: string,
  classId: string,
) {
  const namespace = `schedules:${classId}`;
  const [totalClasses, completed, present, partial, absent, excused] =
    await dashboardAggregate.countBatch(ctx, [
      { namespace },
      { namespace, bounds: { eq: ["completed"] } },
      ...["present", "partial", "absent", "excused"].map((status) => ({
        namespace: `attendance:${studentId}:${classId}`,
        bounds: { eq: [status] },
      })),
    ]);
  const attendanceCounts = { present, partial, absent, excused };
  const verifiedClasses = present + partial + absent + excused;
  return {
    totalClasses,
    verifiedClasses,
    pendingVerification: completed - verifiedClasses,
    upcomingClasses: totalClasses - completed,
    attendanceCounts,
  };
}
