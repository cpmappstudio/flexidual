import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";
import { canAccessClass } from "./permissions";
import { getClassTimeZone } from "./model/timeZone";
import { isExternalClassSession } from "../lib/class-session";
import { createSystemNotification } from "./model/systemNotifications";
import {
  getClassNotificationContext,
  listClassNotificationRecipients,
} from "./model/systemNotificationEvents";

const RECENT_PAST_CLASS_LIMIT = 8;
const RECENT_PAST_CLASS_SCAN_LIMIT = 24;
const RECORDING_PART_LIMIT = 10;

const recordingValidator = v.object({
  _id: v.id("recordings"),
  _creationTime: v.number(),
  scheduleId: v.id("classSchedule"),
  roomName: v.string(),
  egressId: v.string(),
  status: v.union(
    v.literal("starting"),
    v.literal("active"),
    v.literal("complete"),
    v.literal("failed"),
    v.literal("aborted"),
  ),
  fileKey: v.optional(v.string()),
  url: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  fileSize: v.optional(v.number()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
});

const pastClassValidator = v.object({
  scheduleId: v.id("classSchedule"),
  lessonIds: v.array(v.id("lessons")),
  title: v.union(v.string(), v.null()),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  sessionType: v.union(
    v.literal("live"),
    v.literal("ignitia"),
    v.literal("abeka"),
  ),
  hasRecording: v.boolean(),
});

// ============================================================================
// INTERNAL MUTATIONS (called by livekit.ts and http.ts webhook handler)
// ============================================================================

/**
 * Create a recording document when an egress starts.
 * Called by toggleRecording in livekit.ts after startRoomCompositeEgress succeeds.
 */
export const createRecording = internalMutation({
  args: {
    scheduleId: v.id("classSchedule"),
    roomName: v.string(),
    egressId: v.string(),
    startedAt: v.number(),
  },
  returns: v.id("recordings"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("recordings", {
      scheduleId: args.scheduleId,
      roomName: args.roomName,
      egressId: args.egressId,
      status: "starting",
      startedAt: args.startedAt,
    });
  },
});

/**
 * Update a recording document when the LiveKit egress webhook fires.
 * Matches by egressId. Sets URL, fileKey, duration, and final status.
 */
export const updateFromWebhook = internalMutation({
  args: {
    egressId: v.string(),
    status: v.union(
      v.literal("starting"),
      v.literal("active"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("aborted"),
    ),
    fileKey: v.optional(v.string()),
    url: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  returns: v.union(v.id("recordings"), v.null()),
  handler: async (ctx, args) => {
    const recording = await ctx.db
      .query("recordings")
      .withIndex("by_egress_id", (q) => q.eq("egressId", args.egressId))
      .first();

    if (!recording) {
      console.warn(
        `[Recordings] No recording found for egressId: ${args.egressId}`,
      );
      return null;
    }

    await ctx.db.patch(recording._id, {
      status: args.status,
      ...(args.fileKey !== undefined && { fileKey: args.fileKey }),
      ...(args.url !== undefined && { url: args.url }),
      ...(args.durationMs !== undefined && { durationMs: args.durationMs }),
      ...(args.fileSize !== undefined && { fileSize: args.fileSize }),
      ...(args.completedAt !== undefined && { completedAt: args.completedAt }),
    });

    const becamePlayable =
      args.status === "complete" &&
      Boolean(args.url) &&
      !(recording.status === "complete" && recording.url);
    if (becamePlayable) {
      const schedule = await ctx.db.get("classSchedule", recording.scheduleId);
      const classData = schedule
        ? await ctx.db.get("classes", schedule.classId)
        : null;
      if (schedule && classData?.isActive) {
        const [context, recipients] = await Promise.all([
          getClassNotificationContext(ctx, classData),
          listClassNotificationRecipients(ctx, classData),
        ]);
        for (const [recipientId, role] of recipients) {
          await createSystemNotification(ctx, {
            recipientId,
            kind: "recording_available",
            classId: classData._id,
            scheduleId: schedule._id,
            recordingId: recording._id,
            className: classData.name,
            role,
            scheduledStart: schedule.scheduledStart,
            scheduledEnd: schedule.scheduledEnd,
            ...context,
            dedupeKey: `recording_available:${recording._id}:${recipientId}`,
          });
        }
      }
    }

    return recording._id;
  },
});

// ============================================================================
// INTERNAL QUERIES
// ============================================================================

/**
 * Look up recording(s) by roomName — used internally to join hasRecording flag.
 */
export const getByRoom = internalQuery({
  args: { roomName: v.string() },
  returns: v.array(recordingValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .collect();
  },
});

// ============================================================================
// PUBLIC QUERIES
// ============================================================================

export const listRecentPastClasses = query({
  args: {
    classId: v.id("classes"),
    now: v.number(),
  },
  returns: v.array(pastClassValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    const classData = await ctx.db.get("classes", args.classId);
    if (!classData || !(await canAccessClass(ctx, user._id, classData))) {
      return [];
    }

    const candidates = await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) =>
        q.eq("classId", args.classId).lt("scheduledStart", args.now),
      )
      .order("desc")
      .take(RECENT_PAST_CLASS_SCAN_LIMIT);
    const schedules = candidates
      .filter(
        (schedule) =>
          schedule.scheduledEnd <= args.now &&
          schedule.status !== "cancelled" &&
          schedule.status !== "active" &&
          !schedule.isLive,
      )
      .slice(0, RECENT_PAST_CLASS_LIMIT);
    const timeZone = (await getClassTimeZone(ctx, classData)) ?? "UTC";

    return await Promise.all(
      schedules.map(async (schedule) => {
        const sessionType = schedule.sessionType ?? ("live" as const);
        const recordings = isExternalClassSession(sessionType)
          ? []
          : await ctx.db
              .query("recordings")
              .withIndex("by_schedule", (q) =>
                q.eq("scheduleId", schedule._id).eq("status", "complete"),
              )
              .take(RECORDING_PART_LIMIT);

        return {
          scheduleId: schedule._id,
          lessonIds: schedule.lessonIds ?? [],
          title: schedule.title ?? null,
          start: schedule.scheduledStart,
          end: schedule.scheduledEnd,
          timeZone,
          sessionType,
          hasRecording: recordings.some((recording) => Boolean(recording.url)),
        };
      }),
    );
  },
});

/**
 * Get all complete recordings for a given schedule.
 * Access rules:
 *  - Teachers and admins: always allowed
 *  - Students: only if enrolled in the class
 */
export const getBySchedule = query({
  args: { scheduleId: v.id("classSchedule") },
  returns: v.array(
    v.object({
      _id: v.id("recordings"),
      egressId: v.string(),
      url: v.union(v.string(), v.null()),
      durationMs: v.union(v.number(), v.null()),
      fileSize: v.union(v.number(), v.null()),
      startedAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return [];

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return [];

    if (!(await canAccessClass(ctx, user._id, classData))) {
      const attendedSession = await ctx.db
        .query("class_sessions")
        .withIndex("by_student_schedule", (q) =>
          q.eq("studentId", user._id).eq("scheduleId", args.scheduleId),
        )
        .first();
      if (!attendedSession) return [];
    }

    if (isExternalClassSession(schedule.sessionType)) return [];

    const recordings = await ctx.db
      .query("recordings")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("status", "complete"),
      )
      .collect();

    return recordings
      .sort((first, second) => first.startedAt - second.startedAt)
      .map((recording) => ({
        _id: recording._id,
        egressId: recording.egressId,
        url: recording.url ?? null,
        durationMs: recording.durationMs ?? null,
        fileSize: recording.fileSize ?? null,
        startedAt: recording.startedAt,
        completedAt: recording.completedAt ?? null,
      }));
  },
});
