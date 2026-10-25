import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getPlayableRecordings,
  playbackPartValidator,
} from "./model/sessionContent";
import { getCurrentUserFromAuth } from "./users";
import { canAccessClass } from "./permissions";
import { isExternalClassSession } from "../lib/class-session";
import { createSystemNotification } from "./model/systemNotifications";
import { revokeWhiteboardRecordingToken } from "./model/whiteboardRecording";
import {
  getClassNotificationContext,
  listClassNotificationRecipients,
} from "./model/systemNotificationEvents";

const recordingValidator = v.object({
  _id: v.id("recordings"),
  _creationTime: v.number(),
  scheduleId: v.id("classSchedule"),
  roomName: v.string(),
  activationId: v.optional(v.string()),
  recordingToken: v.optional(v.string()),
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
  error: v.optional(v.string()),
  errorCode: v.optional(v.number()),
  details: v.optional(v.string()),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
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
    activationId: v.optional(v.string()),
    recordingToken: v.optional(v.string()),
    egressId: v.string(),
    startedAt: v.number(),
  },
  returns: v.id("recordings"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("recordings", {
      scheduleId: args.scheduleId,
      roomName: args.roomName,
      activationId: args.activationId,
      recordingToken: args.recordingToken,
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
    error: v.optional(v.string()),
    errorCode: v.optional(v.number()),
    details: v.optional(v.string()),
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

    const isTerminal =
      recording.status !== "starting" && recording.status !== "active";
    if (
      (isTerminal && args.status !== recording.status) ||
      (recording.status === "active" && args.status === "starting")
    ) {
      return recording._id;
    }

    const updates = {
      status: args.status,
      ...(args.fileKey !== undefined && { fileKey: args.fileKey }),
      ...(args.url !== undefined && { url: args.url }),
      ...(args.durationMs !== undefined && { durationMs: args.durationMs }),
      ...(args.fileSize !== undefined && { fileSize: args.fileSize }),
      ...(args.completedAt !== undefined && {
        completedAt: recording.completedAt ?? args.completedAt,
      }),
      ...(args.error !== undefined && { error: args.error }),
      ...(args.errorCode !== undefined && { errorCode: args.errorCode }),
      ...(args.details !== undefined && { details: args.details }),
    };
    if (
      args.status === "complete" ||
      args.status === "failed" ||
      args.status === "aborted"
    ) {
      if (recording.recordingToken)
        await revokeWhiteboardRecordingToken(
          ctx,
          recording.roomName,
          recording.recordingToken,
        );
    }
    if (
      Object.entries(updates).every(
        ([key, value]) => recording[key as keyof typeof updates] === value,
      )
    )
      return recording._id;
    await ctx.db.patch("recordings", recording._id, updates);

    const becamePlayable =
      args.status === "complete" &&
      Boolean(updates.url ?? recording.url) &&
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

/** Preserve historical LiveKit access; private uploads require current course access. */
async function getScheduleRecordingAccess(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  const user = await getCurrentUserFromAuth(ctx);
  if (!user) return null;
  const schedule = await ctx.db.get("classSchedule", scheduleId);
  if (!schedule || isExternalClassSession(schedule.sessionType)) return null;
  const classData = await ctx.db.get("classes", schedule.classId);
  if (!classData) return null;
  if (await canAccessClass(ctx, user._id, classData))
    return { includePrerecorded: user.isActive && classData.isActive };
  const historicalAccess = Boolean(
    await ctx.db
      .query("class_sessions")
      .withIndex("by_student_schedule", (q) =>
        q.eq("studentId", user._id).eq("scheduleId", scheduleId),
      )
      .first(),
  );
  return historicalAccess ? { includePrerecorded: false } : null;
}

export const getPlayback = query({
  args: { scheduleId: v.id("classSchedule") },
  returns: v.array(playbackPartValidator),
  handler: async (ctx, args) => {
    const access = await getScheduleRecordingAccess(ctx, args.scheduleId);
    return access
      ? await getPlayableRecordings(
          ctx,
          args.scheduleId,
          access.includePrerecorded,
        )
      : [];
  },
});

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
    if (!(await getScheduleRecordingAccess(ctx, args.scheduleId))) return [];

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
