import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { cleanup, vWorkflowId, vResultValidator } from "@convex-dev/workflow";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  abekaError,
  encryptedSession,
  lessonProgress,
} from "./model/abekaValidators";
import { activeStudent } from "./model/abekaAccess";
import {
  setAbekaNextSync,
  refreshAbekaSchedule,
  abekaScheduleAllowsNow,
  selectAbekaPeriod,
} from "./model/abekaScheduling";
import { defaultAbekaSchedule } from "../lib/abeka/schedule";
import { startAbekaSync } from "./abeka";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { ABEKA_REQUEST_INTERVAL_MS } from "../lib/abeka/request-policy";

const providerLimiter = new RateLimiter(components.rateLimiter, {
  abekaOutbound: {
    kind: "token bucket",
    rate: 1,
    period: ABEKA_REQUEST_INTERVAL_MS,
    capacity: 1,
  },
});

export const requestPermit = internalMutation({
  args: { runId: v.optional(v.id("abekaSyncRuns")) },
  returns: v.object({
    ok: v.boolean(),
    stopped: v.boolean(),
    retryAfter: v.number(),
  }),
  handler: async (ctx, { runId }) => {
    if (runId && !(await currentRun(ctx, runId)))
      return { ok: false, stopped: true, retryAfter: 0 };
    // Singleton, written only on provider throttling; not a rate counter.
    const backoff = await ctx.db.query("abekaProviderBackoff").unique();
    if (backoff && backoff.until > Date.now())
      return {
        ok: false,
        stopped: true,
        retryAfter: backoff.until - Date.now(),
      };
    const result = await providerLimiter.limit(ctx, "abekaOutbound");
    return {
      ok: result.ok,
      stopped: false,
      retryAfter: result.retryAfter ?? 0,
    };
  },
});

export const pauseProvider = internalMutation({
  args: { until: v.number() },
  returns: v.null(),
  handler: async (ctx, { until }) => {
    if (!Number.isSafeInteger(until)) return null;
    const previous = await ctx.db.query("abekaProviderBackoff").unique();
    if (previous) {
      if (until > previous.until)
        await ctx.db.patch("abekaProviderBackoff", previous._id, { until });
    } else await ctx.db.insert("abekaProviderBackoff", { until });
    return null;
  },
});

const WEEK = 7 * 24 * 60 * 60 * 1000;
export const runArgs = { runId: v.id("abekaSyncRuns") };

export async function currentRun(ctx: QueryCtx, runId: Id<"abekaSyncRuns">) {
  const run = await ctx.db.get(runId);
  const connection = run ? await ctx.db.get(run.connectionId) : null;
  if (
    !run ||
    run.status !== "running" ||
    !connection ||
    connection.latestRunId !== runId ||
    connection.revision !== run.revision ||
    connection.status === "disconnected"
  )
    return null;
  const school = await ctx.db.get(connection.schoolId);
  if (!school?.isActive) return null;
  return { run, connection };
}

export const credentials = internalQuery({
  args: runArgs,
  returns: v.union(
    v.null(),
    v.object({ schoolId: v.id("schools"), encrypted: encryptedSession }),
  ),
  handler: async (ctx, { runId }) => {
    const state = await currentRun(ctx, runId);
    if (!state) return null;
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", state.connection._id),
      )
      .unique();
    return secret?.encrypted
      ? { schoolId: state.connection.schoolId, encrypted: secret.encrypted }
      : null;
  },
});

export const renewalRequested = internalQuery({
  args: runArgs,
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const state = await currentRun(ctx, runId);
    return !!state?.run.forceRenewal && !state.run.renewalAttempted;
  },
});

// Claim before making the external request: workflow retries/concurrent calls
// cannot submit the password twice for the same run.
export const claimRenewal = internalMutation({
  args: runArgs,
  returns: v.union(
    v.null(),
    v.object({ schoolId: v.id("schools"), credentials: encryptedSession }),
  ),
  handler: async (ctx, { runId }) => {
    const state = await currentRun(ctx, runId);
    if (!state || state.run.renewalAttempted) return null;
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", state.connection._id),
      )
      .unique();
    if (
      !secret?.credentials ||
      (state.connection.lastRenewalAttemptAt &&
        Date.now() - state.connection.lastRenewalAttemptAt < 60_000)
    )
      return null;
    await ctx.db.patch(runId, { renewalAttempted: true });
    await ctx.db.patch(state.connection._id, {
      lastRenewalAttemptAt: Date.now(),
    });
    return {
      schoolId: state.connection.schoolId,
      credentials: secret.credentials,
    };
  },
});

export const commitRenewal = internalMutation({
  args: {
    ...runArgs,
    encrypted: encryptedSession,
    externalSchoolId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    if (!state?.run.renewalAttempted) return false;
    if (
      state.connection.confirmed &&
      state.connection.externalSchoolId !== args.externalSchoolId
    ) {
      await failRun(ctx, args.runId, "SCHOOL_MISMATCH");
      return false;
    }
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", state.connection._id),
      )
      .unique();
    if (!secret?.credentials) return false;
    await ctx.db.patch(secret._id, { encrypted: args.encrypted });
    await ctx.db.patch(state.connection._id, {
      status: state.connection.confirmed ? "connected" : "connecting",
      errorCode: undefined,
    });
    return true;
  },
});

export const identifySchool = internalMutation({
  args: {
    ...runArgs,
    externalSchoolId: v.string(),
    externalSchoolName: v.string(),
    unavailableStudents: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    if (!state) return false;
    const connection = state.connection;
    if (
      connection.confirmed &&
      connection.externalSchoolId &&
      connection.externalSchoolId !== args.externalSchoolId
    ) {
      await failRun(ctx, args.runId, "SCHOOL_MISMATCH");
      return false;
    }
    await ctx.db.patch(connection._id, {
      externalSchoolId: args.externalSchoolId,
      externalSchoolName: args.externalSchoolName,
      unavailableStudents: args.unavailableStudents,
      status: connection.confirmed ? "connected" : "needs_confirmation",
    });
    return connection.confirmed;
  },
});

export const saveRosterBatch = internalMutation({
  args: {
    ...runArgs,
    students: v.array(v.object({ loginId: v.string(), name: v.string() })),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    if (!state?.connection.confirmed || args.students.length > 50) return false;
    for (const student of args.students) {
      const existing = await ctx.db
        .query("abekaStudents")
        .withIndex("by_connection_login", (q) =>
          q
            .eq("connectionId", state.connection._id)
            .eq("loginId", student.loginId),
        )
        .unique();
      if (existing)
        await ctx.db.patch(existing._id, {
          name: student.name,
          rosterRunId: args.runId,
        });
      else
        await ctx.db.insert("abekaStudents", {
          connectionId: state.connection._id,
          ...student,
          rosterRunId: args.runId,
        });
    }
    return true;
  },
});

export const commitRoster = internalMutation({
  args: runArgs,
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const state = await currentRun(ctx, runId);
    if (!state) return false;
    await ctx.db.patch(state.connection._id, { rosterRunId: runId });
    return true;
  },
});

export const studentPage = internalQuery({
  args: { ...runArgs, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.id("abekaStudents")),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    if (!state) return { page: [], continueCursor: "", isDone: true };
    if (state.run.studentId)
      return { page: [state.run.studentId], continueCursor: "", isDone: true };
    const result = await ctx.db
      .query("abekaStudents")
      .withIndex("by_connection_user", (q) =>
        q.eq("connectionId", state.connection._id).gt("userId", undefined),
      )
      .paginate({ ...args.paginationOpts, numItems: 20 });
    return {
      ...result,
      page: result.page
        .filter((s) => s.rosterRunId === args.runId)
        .map((s) => s._id),
    };
  },
});

function studentBelongsToRun(
  state: { run: Doc<"abekaSyncRuns">; connection: Doc<"abekaConnections"> },
  student: Doc<"abekaStudents">,
) {
  return (
    student.connectionId === state.connection._id &&
    (state.run.studentId
      ? student._id === state.run.studentId &&
        student.rosterRunId === state.connection.rosterRunId
      : student.rosterRunId === state.run._id)
  );
}

export const studentContext = internalQuery({
  args: { ...runArgs, studentId: v.id("abekaStudents") },
  returns: v.union(v.null(), v.object({ loginId: v.string() })),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    const student = await ctx.db.get(args.studentId);
    if (
      !state?.connection.confirmed ||
      !student?.userId ||
      !studentBelongsToRun(state, student)
    )
      return null;
    if (!(await activeStudent(ctx, state.connection.schoolId, student.userId)))
      return null;
    return { loginId: student.loginId };
  },
});

export const saveProgress = internalMutation({
  args: {
    ...runArgs,
    studentId: v.id("abekaStudents"),
    subjectId: v.string(),
    subjectName: v.optional(v.string()),
    lessons: v.array(lessonProgress),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    const student = await ctx.db.get(args.studentId);
    if (
      !state ||
      !student?.userId ||
      !studentBelongsToRun(state, student) ||
      !(await activeStudent(ctx, state.connection.schoolId, student.userId))
    )
      return false;
    if (!args.lessons.length || args.lessons.length > 500) return false;
    const existing = await ctx.db
      .query("abekaProgress")
      .withIndex("by_student_subject", (q) =>
        q.eq("studentId", args.studentId).eq("subjectId", args.subjectId),
      )
      .unique();
    const fields = {
      ...args,
      subjectName:
        args.subjectName ??
        existing?.subjectName ??
        args.lessons[0].subjectName,
      syncedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("abekaProgress", fields);
    if (student.hasProgress !== true)
      await ctx.db.patch(student._id, { hasProgress: true });
    return true;
  },
});

export const studentComplete = internalMutation({
  args: {
    ...runArgs,
    studentId: v.id("abekaStudents"),
    subjectIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.runId);
    const student = await ctx.db.get(args.studentId);
    if (
      !state ||
      !student?.userId ||
      !studentBelongsToRun(state, student) ||
      student.syncedRunId === args.runId ||
      !(await activeStudent(ctx, state.connection.schoolId, student.userId))
    )
      return null;
    const progress = await ctx.db
      .query("abekaProgress")
      .withIndex("by_student_subject", (q) => q.eq("studentId", student._id))
      .take(25);
    if (
      args.subjectIds.some(
        (id) =>
          !progress.some((p) => p.subjectId === id && p.runId === args.runId),
      )
    )
      return null;
    for (const stale of progress.filter(
      (p) => !args.subjectIds.includes(p.subjectId),
    ))
      await ctx.db.delete(stale._id);
    await ctx.db.patch(student._id, {
      lastSyncedAt: Date.now(),
      syncedRunId: args.runId,
      syncPending: undefined,
      hasProgress: args.subjectIds.length > 0,
    });
    await ctx.db.patch(state.run._id, {
      studentsSynced: state.run.studentsSynced + 1,
    });
    return null;
  },
});

async function failRun(
  ctx: MutationCtx,
  runId: Id<"abekaSyncRuns">,
  code:
    | "NEEDS_RECONNECT"
    | "SCHOOL_MISMATCH"
    | "REPORT_FORMAT_CHANGED"
    | "PROVIDER_UNAVAILABLE"
    | "SYNC_FAILED",
) {
  const state = await currentRun(ctx, runId);
  if (!state) return;
  await ctx.db.patch(runId, {
    status: "failed",
    finishedAt: Date.now(),
    errorCode: code,
  });
  const reconnect = code === "NEEDS_RECONNECT" || code === "SCHOOL_MISMATCH";
  if (state.run.catalog) {
    await ctx.db.patch(state.connection._id, { catalogError: code });
    if (!reconnect) {
      await refreshAbekaSchedule(
        ctx,
        state.connection._id,
        state.connection.nextSyncAt,
        true,
      );
      return;
    }
  }
  await ctx.db.patch(state.connection._id, {
    status: reconnect ? "needs_reconnect" : "error",
    errorCode: code,
  });
  await refreshAbekaSchedule(
    ctx,
    state.connection._id,
    !reconnect && state.connection.confirmed
      ? (state.run.studentId && state.connection.nextSyncAt) ||
          Date.now() + WEEK
      : undefined,
    !!state.run.studentId,
  );
  if (reconnect) {
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) =>
        q.eq("connectionId", state.connection._id),
      )
      .unique();
    if (secret) {
      if (code === "SCHOOL_MISMATCH" || !secret.credentials)
        await ctx.db.delete(secret._id);
      else await ctx.db.patch(secret._id, { encrypted: undefined });
    }
  }
}

export const fail = internalMutation({
  args: { ...runArgs, code: abekaError },
  returns: v.null(),
  handler: async (ctx, args) => {
    await failRun(ctx, args.runId, args.code);
    return null;
  },
});

export const onComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object(runArgs),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await currentRun(ctx, args.context.runId);
    if (!state) {
      const run = await ctx.db.get(args.context.runId);
      if (run?.status === "running")
        await ctx.db.patch(run._id, {
          status: "canceled",
          finishedAt: Date.now(),
        });
    }
    if (state) {
      if (args.result.kind !== "success")
        await failRun(ctx, state.run._id, "SYNC_FAILED");
      else {
        await ctx.db.patch(state.run._id, {
          status: "completed",
          finishedAt: Date.now(),
        });
        if (state.run.catalog) {
          await refreshAbekaSchedule(
            ctx,
            state.connection._id,
            state.connection.nextSyncAt,
            true,
          );
        } else if (state.connection.confirmed) {
          await ctx.db.patch(state.connection._id, {
            status: "connected",
            ...(state.run.studentId ? {} : { lastSyncedAt: Date.now() }),
          });
          await refreshAbekaSchedule(
            ctx,
            state.connection._id,
            state.run.studentId
              ? state.connection.nextSyncAt
              : Date.now() + WEEK,
            !!state.run.studentId,
          );
          if (
            state.run.initializeCatalog &&
            state.connection.catalogAttemptAt === undefined
          ) {
            await startAbekaSync(
              ctx,
              (await ctx.db.get(state.connection._id))!,
              { catalog: true },
            );
          }
        }
      }
    }
    await ctx.scheduler.runAfter(0, internal.abekaSync.cleanupWorkflow, {
      workflowId: args.workflowId,
    });
    return null;
  },
});

export const cleanupWorkflow = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, args) => {
    await cleanup(ctx, components.workflow, args.workflowId);
    return null;
  },
});

export const runScheduled = internalMutation({
  args: { connectionId: v.id("abekaConnections"), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, { connectionId, generation }): Promise<null> => {
    const connection = await ctx.db.get("abekaConnections", connectionId);
    if (
      !connection?.scheduledSyncId ||
      connection.syncScheduleGeneration !== generation ||
      connection.nextSyncAt === undefined ||
      connection.nextSyncAt > Date.now()
    )
      return null;
    // Consume before starting: never cancel this invocation and its descendants.
    await ctx.db.patch("abekaConnections", connectionId, {
      scheduledSyncId: undefined,
    });
    if (
      !connection.confirmed ||
      !["connected", "error"].includes(connection.status) ||
      !(await ctx.db.get("schools", connection.schoolId))?.isActive
    ) {
      await setAbekaNextSync(ctx, connectionId);
      return null;
    }
    if (!(await abekaScheduleAllowsNow(ctx, connection, Date.now()))) {
      await refreshAbekaSchedule(ctx, connectionId);
      return null;
    }
    // If a student sync is running, its completion/failure re-arms this due date.
    await startAbekaSync(ctx, connection);
    return null;
  },
});

export const initializeSchedules = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    updated: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    if (paginationOpts.numItems > 50)
      throw new Error("Use batches of at most 50");
    const page = await ctx.db
      .query("abekaConnections")
      .paginate(paginationOpts);
    let updated = 0;
    for (const connection of page.page) {
      if (connection.syncSchedule) continue;
      const school = await ctx.db.get("schools", connection.schoolId);
      const schedule = defaultAbekaSchedule(
        connection.nextSyncAt ??
          connection.lastSyncedAt ??
          connection._creationTime,
        school?.timeZone ?? "UTC",
      );
      const period = school?.timeZone
        ? await selectAbekaPeriod(ctx, school._id, school.timeZone, Date.now())
        : null;
      await ctx.db.patch("abekaConnections", connection._id, {
        syncSchedule: schedule,
        syncAcademicPeriodId: period?._id,
      });
      await refreshAbekaSchedule(ctx, connection._id);
      updated++;
    }
    return {
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// One-off, bounded migration for connections created before runAt scheduling.
// Dry-run first; callers continue with continueCursor until isDone.
export const backfillSchedules = internalMutation({
  args: { paginationOpts: paginationOptsValidator, dryRun: v.boolean() },
  returns: v.object({
    scheduled: v.number(),
    pending: v.number(),
    overdue: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts, dryRun }) => {
    if (paginationOpts.numItems > 50)
      throw new Error("Use batches of at most 50");
    const page = await ctx.db
      .query("abekaConnections")
      .withIndex("by_next_sync", (q) => q.gt("nextSyncAt", 0))
      .paginate(paginationOpts);
    let scheduled = 0,
      pending = 0,
      overdue = 0;
    for (const connection of page.page) {
      // Configurable schedules are managed by refreshAbekaSchedule, not this legacy migration.
      if (connection.syncSchedule) continue;
      const eligible =
        connection.confirmed &&
        ["connected", "error"].includes(connection.status) &&
        (await ctx.db.get("schools", connection.schoolId))?.isActive;
      const job = connection.scheduledSyncId
        ? await ctx.db.system.get(
            "_scheduled_functions",
            connection.scheduledSyncId,
          )
        : null;
      if (eligible && job?.state.kind === "pending") {
        pending++;
        continue;
      }
      if (eligible) {
        scheduled++;
        if (connection.nextSyncAt! <= Date.now()) overdue++;
      }
      if (!dryRun)
        await setAbekaNextSync(
          ctx,
          connection._id,
          eligible ? connection.nextSyncAt : undefined,
        );
    }
    return {
      scheduled,
      pending,
      overdue,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
