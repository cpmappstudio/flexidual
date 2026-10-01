import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { cancel, start, type WorkflowId } from "@convex-dev/workflow";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { internal, components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  abekaConnectionFields,
  abekaRunFields,
  abekaStudentFields,
  abekaProgressFields,
  encryptedSession,
  abekaSchedule,
} from "./model/abekaValidators";
import { activeStudent, requireAbekaAdmin } from "./model/abekaAccess";
import {
  setAbekaNextSync,
  refreshAbekaSchedule,
  selectAbekaPeriod,
  abekaPeriod,
} from "./model/abekaScheduling";
import { defaultAbekaSchedule } from "../lib/abeka/schedule";
import { ABEKA_MANUAL_SYNC_INTERVAL_MS } from "../lib/abeka/request-policy";

const limiter = new RateLimiter(components.rateLimiter, {
  connectAbeka: { kind: "fixed window", rate: 6, period: HOUR },
});
const connectionDoc = v.object({
  _id: v.id("abekaConnections"),
  _creationTime: v.number(),
  ...abekaConnectionFields,
});
const runDoc = v.object({
  _id: v.id("abekaSyncRuns"),
  _creationTime: v.number(),
  ...abekaRunFields,
});
const studentDoc = v.object({
  _id: v.id("abekaStudents"),
  _creationTime: v.number(),
  ...abekaStudentFields,
  syncPending: v.boolean(),
  hasProgress: v.boolean(),
  linkedName: v.union(v.string(), v.null()),
  campusName: v.union(v.string(), v.null()),
  campusId: v.union(v.id("campuses"), v.null()),
  available: v.boolean(),
});

async function connectionForSchool(ctx: MutationCtx, schoolId: Id<"schools">) {
  await requireAbekaAdmin(ctx, schoolId);
  const connection = await ctx.db
    .query("abekaConnections")
    .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
    .unique();
  if (!connection) throw new ConvexError("NOT_CONNECTED");
  return connection;
}

export async function startAbekaSync(
  ctx: MutationCtx,
  connection: Doc<"abekaConnections">,
  options: {
    forceRenewal?: boolean;
    studentId?: Id<"abekaStudents">;
    catalog?: boolean;
    initializeCatalog?: boolean;
  } = {},
) {
  const previous = connection.latestRunId
    ? await ctx.db.get(connection.latestRunId)
    : null;
  if (previous?.status === "running") return previous._id;
  if (!options.studentId && !options.catalog)
    await setAbekaNextSync(ctx, connection._id);
  const runId = await ctx.db.insert("abekaSyncRuns", {
    connectionId: connection._id,
    revision: connection.revision,
    status: "running",
    startedAt: Date.now(),
    studentsSynced: 0,
    ...options,
  });
  await ctx.db.patch(connection._id, {
    latestRunId: runId,
    ...(options.catalog
      ? { catalogAttemptAt: Date.now(), catalogError: undefined }
      : {
          ...(options.studentId ? {} : { lastAttemptAt: Date.now() }),
          errorCode: undefined,
        }),
  });
  const workflowId = await start(
    ctx,
    options.catalog
      ? internal.abekaWorkflow.catalog
      : internal.abekaWorkflow.sync,
    { runId, ...(options.studentId ? { studentId: options.studentId } : {}) },
    {
      startAsync: true,
      onComplete: internal.abekaSync.onComplete,
      context: { runId },
    },
  );
  await ctx.db.patch(runId, { workflowId });
  return runId;
}

async function cancelActive(
  ctx: MutationCtx,
  connection: Doc<"abekaConnections">,
) {
  const run = connection.latestRunId
    ? await ctx.db.get(connection.latestRunId)
    : null;
  if (run?.status === "running") {
    await ctx.db.patch(run._id, { status: "canceled", finishedAt: Date.now() });
    if (run.workflowId)
      await cancel(ctx, components.workflow, run.workflowId as WorkflowId);
  }
}

export const status = query({
  args: { schoolId: v.id("schools") },
  returns: v.object({
    hasCredentials: v.boolean(),
    schedule: v.union(abekaSchedule, v.null()),
    scheduleTimeZone: v.union(v.string(), v.null()),
    schedulePeriod: v.union(
      v.object({
        name: v.string(),
        startDate: v.string(),
        endDate: v.string(),
      }),
      v.null(),
    ),
    connection: v.union(v.null(), connectionDoc),
    run: v.union(v.null(), runDoc),
  }),
  handler: async (ctx, { schoolId }) => {
    await requireAbekaAdmin(ctx, schoolId);
    const connection = await ctx.db
      .query("abekaConnections")
      .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
      .unique();
    const school = await ctx.db.get("schools", schoolId);
    return {
      schedule: connection
        ? (connection.syncSchedule ??
          defaultAbekaSchedule(
            connection.nextSyncAt ?? connection._creationTime,
            school?.timeZone ?? "UTC",
          ))
        : null,
      scheduleTimeZone: school?.timeZone ?? null,
      schedulePeriod: connection ? await abekaPeriod(ctx, connection) : null,
      hasCredentials: connection
        ? !!(
            await ctx.db
              .query("abekaSecrets")
              .withIndex("by_connection", (q) =>
                q.eq("connectionId", connection._id),
              )
              .unique()
          )?.credentials
        : false,
      connection,
      run: connection?.latestRunId
        ? await ctx.db.get(connection.latestRunId)
        : null,
    };
  },
});

export const updateSchedule = mutation({
  args: { schoolId: v.id("schools"), schedule: abekaSchedule },
  returns: v.null(),
  handler: async (ctx, { schoolId, schedule }) => {
    const connection = await connectionForSchool(ctx, schoolId);
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ||
      !Number.isInteger(schedule.weekday) ||
      schedule.weekday < 0 ||
      schedule.weekday > 6
    )
      throw new ConvexError("INVALID_SYNC_SCHEDULE");
    const school = await ctx.db.get("schools", schoolId);
    if (schedule.mode !== "manual" && !school?.timeZone)
      throw new ConvexError("INVALID_TIME_ZONE");
    const period =
      schedule.stopAtPeriodEnd && schedule.mode !== "manual" && school?.timeZone
        ? await selectAbekaPeriod(ctx, schoolId, school.timeZone, Date.now())
        : null;
    await ctx.db.patch("abekaConnections", connection._id, {
      syncSchedule: schedule,
      syncAcademicPeriodId: period?._id,
    });
    await refreshAbekaSchedule(ctx, connection._id);
    return null;
  },
});

// Called by the authenticated HTTP endpoint, before reading any secret body.
export const authorizeConnection = internalMutation({
  args: { schoolId: v.id("schools") },
  returns: v.number(),
  handler: async (ctx, { schoolId }) => {
    await requireAbekaAdmin(ctx, schoolId);
    await limiter.limit(ctx, "connectAbeka", { key: schoolId, throws: true });
    const connection = await ctx.db
      .query("abekaConnections")
      .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
      .unique();
    return connection?.revision ?? 0;
  },
});

export const saveSession = internalMutation({
  args: {
    schoolId: v.id("schools"),
    encrypted: encryptedSession,
    credentials: v.optional(encryptedSession),
    expectedRevision: v.optional(v.number()),
    externalSchoolId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { schoolId, encrypted, credentials, expectedRevision, externalSchoolId },
  ) => {
    const user = await requireAbekaAdmin(ctx, schoolId);
    let connection = await ctx.db
      .query("abekaConnections")
      .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
      .unique();
    if (
      expectedRevision !== undefined &&
      expectedRevision !== (connection?.revision ?? 0)
    )
      throw new ConvexError("CONNECTION_CHANGED");
    if (
      externalSchoolId &&
      connection?.confirmed &&
      connection.externalSchoolId !== externalSchoolId
    )
      throw new ConvexError("SCHOOL_MISMATCH");
    if (connection) {
      await cancelActive(ctx, connection);
      await ctx.db.patch(connection._id, {
        revision: connection.revision + 1,
        status: "connecting",
        connectedBy: user._id,
        errorCode: undefined,
      });
    } else {
      const school = await ctx.db.get("schools", schoolId);
      const period = school?.timeZone
        ? await selectAbekaPeriod(ctx, schoolId, school.timeZone, Date.now())
        : null;
      const id = await ctx.db.insert("abekaConnections", {
        curriculumLinksMigratedAt: Date.now(),
        schoolId,
        revision: 1,
        status: "connecting",
        confirmed: false,
        connectedBy: user._id,
        syncSchedule: {
          mode: "weekly",
          time: "08:00",
          weekday: 1,
          stopAtPeriodEnd: true,
        },
        syncAcademicPeriodId: period?._id,
      });
      connection = await ctx.db.get(id);
    }
    if (!connection) throw new ConvexError("NOT_CONNECTED");
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection!._id))
      .unique();
    if (secret) await ctx.db.patch(secret._id, { encrypted, credentials });
    else
      await ctx.db.insert("abekaSecrets", {
        connectionId: connection._id,
        encrypted,
        credentials,
      });
    await startAbekaSync(ctx, (await ctx.db.get(connection._id))!);
    return null;
  },
});

export const renewSession = mutation({
  args: { schoolId: v.id("schools") },
  returns: v.null(),
  handler: async (ctx, { schoolId }) => {
    const connection = await connectionForSchool(ctx, schoolId);
    if (connection.status === "disconnected")
      throw new ConvexError("NOT_CONNECTED");
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .unique();
    if (!secret?.credentials) throw new ConvexError("NEEDS_CREDENTIALS");
    const current = connection.latestRunId
      ? await ctx.db.get(connection.latestRunId)
      : null;
    if (current?.status === "running") throw new ConvexError("SYNC_RUNNING");
    if (
      connection.lastRenewalAttemptAt &&
      Date.now() - connection.lastRenewalAttemptAt < 60_000
    )
      throw new ConvexError("SYNC_COOLDOWN");
    await limiter.limit(ctx, "connectAbeka", { key: schoolId, throws: true });
    await startAbekaSync(ctx, connection, { forceRenewal: true });
    return null;
  },
});

export const confirm = mutation({
  args: { schoolId: v.id("schools"), externalSchoolId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await connectionForSchool(ctx, args.schoolId);
    const current = connection.latestRunId
      ? await ctx.db.get(connection.latestRunId)
      : null;
    if (current?.status === "running") throw new ConvexError("SYNC_RUNNING");
    if (
      connection.status !== "needs_confirmation" ||
      connection.externalSchoolId !== args.externalSchoolId
    )
      throw new ConvexError("INVALID_CONFIRMATION");
    await ctx.db.patch(connection._id, {
      confirmed: true,
      status: "connected",
    });
    await startAbekaSync(
      ctx,
      {
        ...connection,
        confirmed: true,
        status: "connected",
      },
      { initializeCatalog: connection.catalogAttemptAt === undefined },
    );
    return null;
  },
});

export const syncNow = mutation({
  args: { schoolId: v.id("schools") },
  returns: v.null(),
  handler: async (ctx, { schoolId }) => {
    const connection = await connectionForSchool(ctx, schoolId);
    if (
      !connection.confirmed ||
      !["connected", "error", "needs_reconnect"].includes(connection.status)
    )
      throw new ConvexError("NOT_CONNECTED");
    if (connection.status === "needs_reconnect") {
      const secret = await ctx.db
        .query("abekaSecrets")
        .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
        .unique();
      if (!secret?.credentials) throw new ConvexError("NEEDS_CREDENTIALS");
    }
    if (
      connection.lastAttemptAt &&
      Date.now() - connection.lastAttemptAt < ABEKA_MANUAL_SYNC_INTERVAL_MS
    )
      throw new ConvexError("SYNC_COOLDOWN");
    await startAbekaSync(ctx, connection);
    return null;
  },
});

export const disconnect = mutation({
  args: { schoolId: v.id("schools") },
  returns: v.null(),
  handler: async (ctx, { schoolId }) => {
    const connection = await connectionForSchool(ctx, schoolId);
    await cancelActive(ctx, connection);
    const secret = await ctx.db
      .query("abekaSecrets")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .unique();
    if (secret) await ctx.db.delete(secret._id);
    await setAbekaNextSync(ctx, connection._id);
    await ctx.db.patch(connection._id, {
      status: "disconnected",
      revision: connection.revision + 1,
      errorCode: undefined,
    });
    return null;
  },
});

export const students = query({
  args: { schoolId: v.id("schools"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(studentDoc),
  handler: async (ctx, args) => {
    await requireAbekaAdmin(ctx, args.schoolId);
    const connection = await ctx.db
      .query("abekaConnections")
      .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId))
      .unique();
    if (!connection?.confirmed)
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("abekaStudents")
      .withIndex("by_connection_login", (q) =>
        q.eq("connectionId", connection._id),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 25),
      });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (student) => {
          const linked = student.userId
            ? await activeStudent(ctx, args.schoolId, student.userId)
            : null;
          // Older rows have no availability flag. Use one indexed read until
          // their next sync; never send lesson arrays to the table.
          const report =
            student.userId && student.hasProgress === undefined
              ? await ctx.db
                  .query("abekaProgress")
                  .withIndex("by_student_subject", (q) =>
                    q.eq("studentId", student._id),
                  )
                  .first()
              : null;
          return {
            ...student,
            syncPending:
              !!student.userId &&
              (student.syncPending ?? student.lastSyncedAt === undefined),
            hasProgress:
              !!student.userId &&
              (student.hasProgress ?? !!report?.lessons.length),
            linkedName: linked?.user.fullName ?? null,
            campusName: linked?.campusName ?? null,
            campusId: linked?.campusId ?? null,
            available: student.rosterRunId === connection.rosterRunId,
          };
        }),
      ),
    };
  },
});

export const linkStudent = mutation({
  args: {
    studentId: v.id("abekaStudents"),
    userId: v.union(v.id("users"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    const connection = student ? await ctx.db.get(student.connectionId) : null;
    if (!student || !connection) throw new ConvexError("NOT_FOUND");
    await requireAbekaAdmin(ctx, connection.schoolId);
    const run = connection.latestRunId
      ? await ctx.db.get(connection.latestRunId)
      : null;
    if (run?.status === "running") throw new ConvexError("SYNC_RUNNING");
    if (args.userId) {
      if (
        student.rosterRunId !== connection.rosterRunId ||
        !(await activeStudent(ctx, connection.schoolId, args.userId))
      )
        throw new ConvexError("INVALID_STUDENT");
      const existing = await ctx.db
        .query("abekaStudents")
        .withIndex("by_connection_user", (q) =>
          q.eq("connectionId", connection._id).eq("userId", args.userId!),
        )
        .unique();
      if (existing && existing._id !== student._id)
        throw new ConvexError("ALREADY_LINKED");
    }
    if (args.userId === (student.userId ?? null)) return null;
    // Linking changes only the local association. Existing provider snapshots
    // remain valid; Update data or the scheduled sync refreshes them later.
    await ctx.db.patch(student._id, {
      userId: args.userId ?? undefined,
      syncPending: args.userId ? true : undefined,
    });
    return null;
  },
});

export const studentCandidates = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id("users"),
      name: v.string(),
      username: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAbekaAdmin(ctx, args.schoolId);
    if (args.campusId) {
      const campus = await ctx.db.get(args.campusId);
      if (!campus?.isActive || campus.schoolId !== args.schoolId)
        throw new ConvexError("FORBIDDEN");
    }
    const result = await ctx.db
      .query("roleAssignments")
      .withIndex("by_org_role", (q) =>
        q
          .eq("orgId", args.campusId ?? args.schoolId)
          .eq("orgType", args.campusId ? "campus" : "school")
          .eq("role", "student"),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 50),
      });
    const users = await Promise.all(
      result.page.map((r) => ctx.db.get(r.userId)),
    );
    return {
      ...result,
      page: users.flatMap((user) =>
        user?.isActive
          ? [
              {
                id: user._id,
                name: user.fullName,
                username: user.username ?? null,
              },
            ]
          : [],
      ),
    };
  },
});

export const progress = query({
  args: { studentId: v.id("abekaStudents") },
  returns: v.array(
    v.object({
      _id: v.id("abekaProgress"),
      _creationTime: v.number(),
      ...abekaProgressFields,
    }),
  ),
  handler: async (ctx, { studentId }) => {
    const student = await ctx.db.get(studentId);
    const connection = student ? await ctx.db.get(student.connectionId) : null;
    if (!connection) throw new ConvexError("NOT_FOUND");
    await requireAbekaAdmin(ctx, connection.schoolId);
    return await ctx.db
      .query("abekaProgress")
      .withIndex("by_student_subject", (q) => q.eq("studentId", studentId))
      .take(24);
  },
});
