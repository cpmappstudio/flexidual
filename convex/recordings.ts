import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUserFromAuth } from "./users";
import { canAccessClass } from "./permissions";
import { canAccessEvent } from "./model/eventAccess";
import { pageEventAudienceAssignments } from "./model/eventChatAudience";
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
  scheduleId: v.optional(v.id("classSchedule")),
  eventOccurrenceId: v.optional(v.id("eventOccurrences")),
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
    scheduleId: v.optional(v.id("classSchedule")),
    eventOccurrenceId: v.optional(v.id("eventOccurrences")),
    roomName: v.string(),
    activationId: v.optional(v.string()),
    recordingToken: v.optional(v.string()),
    egressId: v.string(),
    startedAt: v.number(),
  },
  returns: v.id("recordings"),
  handler: async (ctx, args) => {
    if (Boolean(args.scheduleId) === Boolean(args.eventOccurrenceId))
      throw new ConvexError("INVALID_RECORDING_TARGET");
    return await ctx.db.insert("recordings", {
      scheduleId: args.scheduleId,
      eventOccurrenceId: args.eventOccurrenceId,
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
    if (becamePlayable && recording.eventOccurrenceId) {
      await ctx.scheduler.runAfter(
        0,
        internal.recordings.publishEventRecording,
        {
          recordingId: recording._id,
          sourceIndex: 0,
          cursor: null,
        },
      );
    }
    if (becamePlayable && recording.scheduleId) {
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

export const publishEventRecording = internalMutation({
  args: {
    recordingId: v.id("recordings"),
    sourceIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recording = await ctx.db.get("recordings", args.recordingId);
    if (
      !recording?.eventOccurrenceId ||
      recording.status !== "complete" ||
      !recording.url
    )
      return null;
    const occurrence = await ctx.db.get(
      "eventOccurrences",
      recording.eventOccurrenceId,
    );
    const event = occurrence
      ? await ctx.db.get("events", occurrence.eventId)
      : null;
    if (!occurrence || !event) return null;
    const page = await pageEventAudienceAssignments(
      ctx,
      event,
      { sourceIndex: args.sourceIndex, cursor: args.cursor },
      10,
    );
    const [school, campus] = await Promise.all([
      ctx.db.get("schools", event.schoolId),
      event.campusId ? ctx.db.get("campuses", event.campusId) : null,
    ]);
    for (const assignment of page.rows) {
      if (!(await canAccessEvent(ctx, assignment.userId, event))) continue;
      await createSystemNotification(ctx, {
        recipientId: assignment.userId,
        kind: "recording_available",
        eventId: event._id,
        eventTitle: event.title,
        recordingId: recording._id,
        schoolId: event.schoolId,
        campusId: event.campusId,
        schoolName: school?.name,
        campusName: campus?.name,
        organizationSlug: campus?.slug ?? school?.slug,
        scheduledStart: occurrence.scheduledStart,
        scheduledEnd: occurrence.scheduledEnd,
        dedupeKey: `recording_available:${recording._id}:${assignment.userId}`,
      });
    }
    if (page.next)
      await ctx.scheduler.runAfter(
        0,
        internal.recordings.publishEventRecording,
        {
          recordingId: args.recordingId,
          sourceIndex: page.next.sourceIndex,
          cursor: page.next.cursor,
        },
      );
    return null;
  },
});

export const removeEventNotifications = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("systemNotifications")
      .withIndex("by_event_and_kind", (q) =>
        q.eq("eventId", args.eventId).eq("kind", "recording_available"),
      )
      .take(50);
    for (const notification of notifications)
      await ctx.db.delete("systemNotifications", notification._id);
    if (notifications.length === 50)
      await ctx.scheduler.runAfter(
        0,
        internal.recordings.removeEventNotifications,
        args,
      );
    return null;
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

export const getByEventOccurrence = query({
  args: { occurrenceId: v.id("eventOccurrences") },
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
    const occurrence = await ctx.db.get("eventOccurrences", args.occurrenceId);
    const event = occurrence
      ? await ctx.db.get("events", occurrence.eventId)
      : null;
    if (!event || !(await canAccessEvent(ctx, user._id, event))) return [];
    const recordings = await ctx.db
      .query("recordings")
      .withIndex("by_event_occurrence", (q) =>
        q.eq("eventOccurrenceId", args.occurrenceId).eq("status", "complete"),
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

export const getEventRecordingTarget = query({
  args: {
    eventId: v.id("events"),
    recordingId: v.id("recordings"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("eventOccurrences"),
      start: v.number(),
      end: v.number(),
      recording: v.object({
        _id: v.id("recordings"),
        url: v.string(),
        durationMs: v.union(v.number(), v.null()),
        startedAt: v.number(),
      }),
    }),
  ),
  handler: async (ctx, { eventId, recordingId }) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;
    const recording = await ctx.db.get(recordingId);
    if (
      recording?.status !== "complete" ||
      !recording.url ||
      !recording.eventOccurrenceId
    )
      return null;
    const occurrence = await ctx.db.get(recording.eventOccurrenceId);
    if (!occurrence || occurrence.eventId !== eventId) return null;
    const event = await ctx.db.get(eventId);
    if (!event || !(await canAccessEvent(ctx, user._id, event))) return null;
    return {
      _id: occurrence._id,
      start: occurrence.scheduledStart,
      end: occurrence.scheduledEnd,
      recording: {
        _id: recording._id,
        url: recording.url,
        durationMs: recording.durationMs ?? null,
        startedAt: recording.startedAt,
      },
    };
  },
});
