import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";
import { canAccessSchedule } from "./model/scheduleAccess";
import { internal } from "./_generated/api";
import { getLiveSessionReopenUntil } from "../lib/live-session-policy";
import {
  ensureLiveActivation,
  findLiveActivation,
  getLiveActivationId,
  liveRoomActivationFields,
} from "./model/liveActivation";

const activationValidator = v.union(
  v.null(),
  v.object({
    ...liveRoomActivationFields,
    _id: v.id("liveRoomActivations"),
    _creationTime: v.number(),
  }),
);

export const getActivation = internalQuery({
  args: { activationId: v.string() },
  returns: activationValidator,
  handler: async (ctx, { activationId }) =>
    findLiveActivation(ctx, activationId),
});

export const prepareCleanup = internalMutation({
  args: { activationId: v.string() },
  returns: activationValidator,
  handler: async (ctx, { activationId }) => {
    const activation = await findLiveActivation(ctx, activationId);
    if (!activation || activation.status !== "closing") return null;
    const recordingJob = activation.recordingJobId
      ? await ctx.db.system.get(activation.recordingJobId)
      : null;
    if (recordingJob?.state.kind === "inProgress") return null;
    if (recordingJob?.state.kind === "pending") {
      await ctx.scheduler.cancel(activation.recordingJobId!);
    }
    return activation;
  },
});

export const finishCleanup = internalMutation({
  args: { activationId: v.string(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { activationId, error }) => {
    const activation = await findLiveActivation(ctx, activationId);
    if (!activation || activation.status !== "closing") return null;
    if (error) {
      const schedule = await ctx.db.get("classSchedule", activation.scheduleId);
      if (
        schedule &&
        schedule.liveEndClaimId === activation.claimId &&
        !schedule.liveCleanupRetrying
      ) {
        await ctx.db.patch("classSchedule", schedule._id, {
          liveCleanupRetrying: true,
        });
      }
      const attempts = activation.cleanupAttempts + 1;
      const nextCleanupAt =
        Date.now() + Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts, 6));
      const cleanupJobId =
        attempts < 6
          ? await ctx.scheduler.runAt(
              nextCleanupAt,
              internal.livekit.cleanupActivation,
              { activationId },
            )
          : undefined;
      await ctx.db.patch("liveRoomActivations", activation._id, {
        cleanupAttempts: attempts,
        nextCleanupAt,
        cleanupJobId,
        cleanupError: error.slice(0, 500),
      });
      return null;
    }
    await ctx.runMutation(internal.schedule.completeLiveSessionEnd, {
      roomName: activation.roomName,
      expectedActivationId: activationId,
      claimId: activation.claimId!,
    });
    await ctx.db.patch("liveRoomActivations", activation._id, {
      status: "closed",
      cleanupError: undefined,
      recordingToken: undefined,
    });
    return null;
  },
});

export const getRecordingOperation = query({
  args: { roomName: v.string(), activationId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ pending: v.boolean(), failed: v.boolean() }),
  ),
  handler: async (ctx, { roomName, activationId }) => {
    const user = await getCurrentUserFromAuth(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", roomName))
      .unique();
    if (
      !user ||
      !schedule ||
      getLiveActivationId(schedule) !== activationId ||
      !(await canAccessSchedule(ctx, user._id, schedule))
    )
      return null;
    const activation = await findLiveActivation(ctx, activationId);
    const job = activation?.recordingJobId
      ? await ctx.db.system.get(activation.recordingJobId)
      : null;
    return {
      pending:
        job?.state.kind === "pending" || job?.state.kind === "inProgress",
      failed: job?.state.kind === "failed",
    };
  },
});

// The scheduler is the execution authority. A timeout alone never releases a running job.
export const recoverClosures = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const legacyClaims = await ctx.db
      .query("classSchedule")
      .withIndex("by_live_room_name_and_live_end_claim_id", (q) =>
        q.eq("liveRoomName", undefined).gt("liveEndClaimId", undefined),
      )
      .take(50);
    for (const schedule of legacyClaims) {
      if (schedule.status !== "completed" || schedule.isLive) continue;
      const activation = await ensureLiveActivation(ctx, schedule);
      const cleanupJobId = await ctx.scheduler.runAfter(
        0,
        internal.livekit.cleanupActivation,
        { activationId: activation.activationId },
      );
      await ctx.db.patch("liveRoomActivations", activation._id, {
        status: "closing",
        claimId: schedule.liveEndClaimId,
        cleanupJobId,
        nextCleanupAt: Date.now() + 60_000,
      });
      await ctx.db.patch("classSchedule", schedule._id, {
        liveRoomName: schedule.roomName,
      });
      const reopenUntil = getLiveSessionReopenUntil(
        schedule.scheduledEnd,
        schedule.liveExtensionEndsAt,
      );
      await ctx.scheduler.runAt(
        Math.max(Date.now(), reopenUntil),
        internal.schedule.cleanupExpiredWhiteboardSession,
        { roomName: schedule.roomName, expectedReopenUntil: reopenUntil },
      );
    }
    const pending = await ctx.db
      .query("liveRoomActivations")
      .withIndex("by_status_and_next_cleanup_at", (q) =>
        q.eq("status", "closing").lte("nextCleanupAt", Date.now()),
      )
      .take(50);
    for (const activation of pending) {
      const job = activation.cleanupJobId
        ? await ctx.db.system.get(activation.cleanupJobId)
        : null;
      if (job?.state.kind === "pending" || job?.state.kind === "inProgress")
        continue;
      const cleanupJobId = await ctx.scheduler.runAfter(
        0,
        internal.livekit.cleanupActivation,
        { activationId: activation.activationId },
      );
      await ctx.db.patch("liveRoomActivations", activation._id, {
        cleanupJobId,
        nextCleanupAt: Date.now() + 60_000,
      });
    }
    return null;
  },
});

export const requestRecording = internalMutation({
  args: {
    roomName: v.string(),
    activationId: v.string(),
    recordingToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .unique();
    if (
      !schedule?.isLive ||
      schedule.status !== "active" ||
      getLiveActivationId(schedule) !== args.activationId
    )
      return false;
    const activation = await ensureLiveActivation(ctx, schedule);
    if (activation.recordingJobId) {
      const job = await ctx.db.system.get(activation.recordingJobId);
      if (job?.state.kind === "pending" || job?.state.kind === "inProgress")
        return false;
    }
    const recordingJobId = await ctx.scheduler.runAfter(
      0,
      internal.livekit.startRecording,
      args,
    );
    await ctx.db.patch("liveRoomActivations", activation._id, {
      recordingJobId,
      recordingToken: args.recordingToken,
    });
    return true;
  },
});

export const stopRecordingIntent = internalMutation({
  args: { roomName: v.string(), activationId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { roomName, activationId }) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", roomName))
      .unique();
    if (!schedule || getLiveActivationId(schedule) !== activationId)
      return null;
    const whiteboard = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const activation = await findLiveActivation(ctx, activationId);
    if (!activation) return whiteboard?.recordingToken ?? null;
    const job = activation.recordingJobId
      ? await ctx.db.system.get(activation.recordingJobId)
      : null;
    if (job?.state.kind === "pending")
      await ctx.scheduler.cancel(activation.recordingJobId!);
    await ctx.db.patch("liveRoomActivations", activation._id, {
      recordingToken: undefined,
    });
    return whiteboard?.recordingToken ?? activation.recordingToken ?? null;
  },
});

export const resolveLiveRoom = internalQuery({
  args: { liveRoomName: v.string() },
  returns: v.union(
    v.null(),
    v.object({ roomName: v.string(), activationId: v.string() }),
  ),
  handler: async (ctx, { liveRoomName }) => {
    const schedule =
      (await ctx.db
        .query("classSchedule")
        .withIndex("by_live_room_name", (q) =>
          q.eq("liveRoomName", liveRoomName),
        )
        .unique()) ??
      (await ctx.db
        .query("classSchedule")
        .withIndex("by_room", (q) => q.eq("roomName", liveRoomName))
        .unique());
    if (
      !schedule?.isLive ||
      (schedule.liveRoomName ?? schedule.roomName) !== liveRoomName
    )
      return null;
    return {
      roomName: schedule.roomName,
      activationId: getLiveActivationId(schedule),
    };
  },
});
