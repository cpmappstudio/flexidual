import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { dateInTimeZone, toCivilDate } from "../../lib/time-zone";
import { nextAbekaSync } from "../../lib/abeka/schedule";

export async function selectAbekaPeriod(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
  timeZone: string,
  now: number,
) {
  const today = dateInTimeZone(now, timeZone);
  const endOfDay = Date.parse(`${today}T23:59:59.999Z`);
  // Both indexed date formats remain supported until legacy numeric dates are migrated.
  const candidates = await Promise.all([
    ctx.db
      .query("academicPeriods")
      .withIndex("by_school_and_start", (q) =>
        q.eq("schoolId", schoolId).gte("startDate", "").lte("startDate", today),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("academicPeriods")
      .withIndex("by_school_and_start", (q) =>
        q.eq("schoolId", schoolId).lte("startDate", endOfDay),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("academicPeriods")
      .withIndex("by_school_and_start", (q) =>
        q.eq("schoolId", schoolId).gt("startDate", today),
      )
      .first(),
    ctx.db
      .query("academicPeriods")
      .withIndex("by_school_and_start", (q) =>
        q
          .eq("schoolId", schoolId)
          .gt("startDate", endOfDay)
          .lt("startDate", ""),
      )
      .first(),
  ]);
  return (
    candidates
      .filter(
        (p): p is Doc<"academicPeriods"> =>
          !!p && toCivilDate(p.endDate) >= today,
      )
      .sort((a, b) =>
        toCivilDate(a.startDate).localeCompare(toCivilDate(b.startDate)),
      )[0] ?? null
  );
}

export async function abekaPeriod(
  ctx: QueryCtx,
  connection: Doc<"abekaConnections">,
) {
  const period = connection.syncAcademicPeriodId
    ? await ctx.db.get("academicPeriods", connection.syncAcademicPeriodId)
    : null;
  return period?.schoolId === connection.schoolId
    ? {
        name: period.name,
        startDate: toCivilDate(period.startDate),
        endDate: toCivilDate(period.endDate),
      }
    : null;
}

export async function abekaScheduleAllowsNow(
  ctx: QueryCtx,
  connection: Doc<"abekaConnections">,
  now: number,
): Promise<boolean> {
  const schedule = connection.syncSchedule;
  if (!schedule) return true; // Existing connections are initialized by the bounded migration.
  if (schedule.mode === "manual") return false;
  const school = await ctx.db.get("schools", connection.schoolId);
  if (!school?.timeZone) return false;
  if (!schedule.stopAtPeriodEnd) return true;
  const period = await abekaPeriod(ctx, connection);
  const day = dateInTimeZone(now, school.timeZone);
  return !!period && day >= period.startDate && day <= period.endDate;
}

export async function refreshAbekaSchedule(
  ctx: MutationCtx,
  connectionId: Id<"abekaConnections">,
  legacyNextSyncAt?: number,
  preserveDue = false,
): Promise<void> {
  const connection = await ctx.db.get("abekaConnections", connectionId);
  if (!connection) return;
  if (!connection.syncSchedule) {
    await setAbekaNextSync(ctx, connectionId, legacyNextSyncAt);
    return;
  }
  const school = await ctx.db.get("schools", connection.schoolId);
  const run = connection.latestRunId
    ? await ctx.db.get("abekaSyncRuns", connection.latestRunId)
    : null;
  let next: number | undefined;
  if (
    school?.isActive &&
    school.timeZone &&
    connection.confirmed &&
    ["connected", "error"].includes(connection.status) &&
    !(run?.status === "running" && !run.studentId && !run.catalog)
  ) {
    next =
      preserveDue &&
      connection.nextSyncAt !== undefined &&
      connection.nextSyncAt <= Date.now() &&
      (await abekaScheduleAllowsNow(ctx, connection, Date.now()))
        ? connection.nextSyncAt
        : nextAbekaSync(
            connection.syncSchedule,
            school.timeZone,
            Date.now(),
            await abekaPeriod(ctx, connection),
          );
  }
  await setAbekaNextSync(ctx, connectionId, next);
}

export async function rescheduleAbekaForSchool(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
): Promise<void> {
  const connection = await ctx.db
    .query("abekaConnections")
    .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
    .unique();
  if (connection?.syncSchedule) {
    if (
      connection.syncSchedule.stopAtPeriodEnd &&
      !connection.syncAcademicPeriodId
    ) {
      const school = await ctx.db.get("schools", schoolId);
      const period = school?.timeZone
        ? await selectAbekaPeriod(ctx, schoolId, school.timeZone, Date.now())
        : null;
      if (period)
        await ctx.db.patch("abekaConnections", connection._id, {
          syncAcademicPeriodId: period._id,
        });
    }
    await refreshAbekaSchedule(ctx, connection._id);
  }
}

// ponytail: one native scheduled mutation per connection; no polling or new queue.
export async function setAbekaNextSync(
  ctx: MutationCtx,
  connectionId: Id<"abekaConnections">,
  nextSyncAt?: number,
): Promise<void> {
  const connection = await ctx.db.get("abekaConnections", connectionId);
  if (!connection) return;
  const scheduled = connection.scheduledSyncId
    ? await ctx.db.system.get(
        "_scheduled_functions",
        connection.scheduledSyncId,
      )
    : null;
  if (scheduled?.state.kind === "pending") {
    if (nextSyncAt !== undefined && connection.nextSyncAt === nextSyncAt)
      return;
    await ctx.scheduler.cancel(scheduled._id);
  }
  const generation = (connection.syncScheduleGeneration ?? 0) + 1;
  const scheduledSyncId =
    nextSyncAt === undefined
      ? undefined
      : await ctx.scheduler.runAt(nextSyncAt, internal.abekaSync.runScheduled, {
          connectionId,
          generation,
        });
  await ctx.db.patch("abekaConnections", connectionId, {
    nextSyncAt,
    scheduledSyncId,
    syncScheduleGeneration: generation,
  });
}
