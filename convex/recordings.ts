import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";
import { hasSystemRole } from "./permissions";

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
      v.literal("aborted")
    ),
    fileKey: v.optional(v.string()),
    url: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recording = await ctx.db
      .query("recordings")
      .withIndex("by_egress_id", (q) => q.eq("egressId", args.egressId))
      .first();

    if (!recording) {
      console.warn(`[Recordings] No recording found for egressId: ${args.egressId}`);
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
  handler: async (ctx, args) => {
    return await ctx.db
      .query("recordings")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .collect();
  },
});

/**
 * Check if a set of scheduleIds has any complete recordings — used by getMySchedule.
 * Returns a Set of scheduleIds that have at least one complete recording.
 */
export const getCompletedScheduleIds = internalQuery({
  args: { scheduleIds: v.array(v.id("classSchedule")) },
  handler: async (ctx, args) => {
    if (args.scheduleIds.length === 0) return [];

    const allRecordings = await Promise.all(
      args.scheduleIds.map((id) =>
        ctx.db
          .query("recordings")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", id))
          .filter((q) => q.eq(q.field("status"), "complete"))
          .first()
      )
    );

    return args.scheduleIds.filter((_, idx) => allRecordings[idx] !== null);
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
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return [];

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return [];

    // Authorization: teacher, any admin, enrolled student, or student who has attended
    const isTeacher = classData.teacherId === user._id || classData.tutorId === user._id;
    const isEnrolledStudent = classData.students.includes(user._id);
    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    if (!isTeacher && !isEnrolledStudent && !isSuperAdmin) {
      // Check admin/principal role assignment
      const adminAssignment = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .filter((q) =>
          q.or(
            q.eq(q.field("role"), "admin"),
            q.eq(q.field("role"), "principal")
          )
        )
        .first();

      if (adminAssignment) {
        // Admin/principal — allowed
      } else {
        // Last resort: student who has ever attended this class session
        const attendedSession = await ctx.db
          .query("class_sessions")
          .withIndex("by_student_schedule", (q) =>
            q.eq("studentId", user._id).eq("scheduleId", args.scheduleId)
          )
          .first();

        if (!attendedSession) return [];
      }
    }

    const recordings = await ctx.db
      .query("recordings")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .collect();

    return recordings.map((r) => ({
      _id: r._id,
      egressId: r.egressId,
      url: r.url ?? null,
      durationMs: r.durationMs ?? null,
      fileSize: r.fileSize ?? null,
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? null,
    }));
  },
});
