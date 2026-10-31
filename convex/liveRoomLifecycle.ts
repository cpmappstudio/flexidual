import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUserFromAuth } from "./users";
import { canAccessSchedule } from "./model/scheduleAccess";
import { canAccessEvent } from "./model/eventAccess";
import { findEventRoom } from "./model/eventRoomAccess";
import { internal } from "./_generated/api";
import { getLiveSessionReopenUntil } from "../lib/live-session-policy";
import {
  ensureLiveActivation,
  ensureEventActivation,
  findLiveActivation,
  getEventActivationId,
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
      if (activation.scheduleId) {
        const schedule = await ctx.db.get(
          "classSchedule",
          activation.scheduleId,
        );
        if (
          schedule &&
          schedule.liveEndClaimId === activation.claimId &&
          !schedule.liveCleanupRetrying
        )
          await ctx.db.patch("classSchedule", schedule._id, {
            liveCleanupRetrying: true,
          });
      } else if (activation.eventOccurrenceId) {
        const occurrence = await ctx.db.get(
          "eventOccurrences",
          activation.eventOccurrenceId,
        );
        if (
          occurrence &&
          occurrence.liveEndClaimId === activation.claimId &&
          !occurrence.liveCleanupRetrying
        )
          await ctx.db.patch("eventOccurrences", occurrence._id, {
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
    const completeArgs = {
      roomName: activation.roomName,
      expectedActivationId: activationId,
      claimId: activation.claimId!,
    };
    if (activation.eventOccurrenceId)
      await ctx.runMutation(
        internal.eventRoom.completeLiveSessionEnd,
        completeArgs,
      );
    else
      await ctx.runMutation(
        internal.schedule.completeLiveSessionEnd,
        completeArgs,
      );
    await ctx.db.patch("liveRoomActivations", activation._id, {
      status: "closed",
      cleanupError: undefined,
      recordingToken: undefined,
    });
    if (activation.eventOccurrenceId) {
      const occurrence = await ctx.db.get(
        "eventOccurrences",
        activation.eventOccurrenceId,
      );
      if (occurrence && !(await ctx.db.get("events", occurrence.eventId)))
        await ctx.scheduler.runAfter(
          0,
          internal.events.removeOccurrencesByEvent,
          {
            eventId: occurrence.eventId,
          },
        );
    }
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
    const eventRoom = schedule ? null : await findEventRoom(ctx, roomName);
    if (
      !user ||
      (schedule
        ? getLiveActivationId(schedule) !== activationId ||
          !(await canAccessSchedule(ctx, user._id, schedule))
        : !eventRoom ||
          getEventActivationId(eventRoom.occurrence) !== activationId ||
          !(await canAccessEvent(ctx, user._id, eventRoom.event)))
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
    const eventRoom = schedule ? null : await findEventRoom(ctx, args.roomName);
    const session = schedule ?? eventRoom?.occurrence;
    if (
      !session?.isLive ||
      session.status !== "active" ||
      (schedule
        ? getLiveActivationId(schedule)
        : getEventActivationId(eventRoom!.occurrence)) !== args.activationId
    )
      return false;
    const activation = schedule
      ? await ensureLiveActivation(ctx, schedule)
      : await ensureEventActivation(ctx, eventRoom!.occurrence);
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
    const eventRoom = schedule ? null : await findEventRoom(ctx, roomName);
    if (
      (schedule
        ? getLiveActivationId(schedule)
        : eventRoom
          ? getEventActivationId(eventRoom.occurrence)
          : null) !== activationId
    )
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

async function scheduleReconciliation(
  ctx: MutationCtx,
  activation: Doc<"liveRoomActivations">,
) {
  const reconcileGeneration = (activation.reconcileGeneration ?? 0) + 1;
  const reconcileJobId = await ctx.scheduler.runAfter(
    1_000,
    internal.livekit.reconcileLiveSession,
    {
      roomName: activation.roomName,
      expectedActivationId: activation.activationId,
      reconciliationGeneration: reconcileGeneration,
    },
  );
  await ctx.db.patch("liveRoomActivations", activation._id, {
    reconcileJobId,
    reconcileGeneration,
    reconcileAgain: undefined,
  });
}

export const requestReconciliation = internalMutation({
  args: { liveRoomName: v.string() },
  returns: v.null(),
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
    const occurrence = schedule
      ? null
      : await ctx.db
          .query("eventOccurrences")
          .withIndex("by_live_room_name", (q) =>
            q.eq("liveRoomName", liveRoomName),
          )
          .unique();
    const liveSession = schedule ?? occurrence;
    if (
      !liveSession?.isLive ||
      liveSession.status !== "active" ||
      (liveSession.liveRoomName ?? liveSession.roomName) !== liveRoomName
    )
      return null;
    const activation = schedule
      ? await ensureLiveActivation(ctx, schedule)
      : await ensureEventActivation(ctx, occurrence!);
    const job = activation.reconcileJobId
      ? await ctx.db.system.get(activation.reconcileJobId)
      : null;
    if (job?.state.kind === "pending") return null;
    if (job?.state.kind === "inProgress") {
      if (!activation.reconcileAgain)
        await ctx.db.patch("liveRoomActivations", activation._id, {
          reconcileAgain: true,
        });
      return null;
    }
    await scheduleReconciliation(ctx, activation);
    return null;
  },
});

export const finishReconciliation = internalMutation({
  args: { activationId: v.string(), generation: v.number() },
  returns: v.null(),
  handler: async (ctx, { activationId, generation }) => {
    const activation = await findLiveActivation(ctx, activationId);
    // A late completion must not clear the replacement of a canceled/failed job.
    if (!activation || activation.reconcileGeneration !== generation)
      return null;
    if (activation.status === "active" && activation.reconcileAgain)
      await scheduleReconciliation(ctx, activation);
    else
      await ctx.db.patch("liveRoomActivations", activation._id, {
        reconcileJobId: undefined,
        reconcileAgain: undefined,
      });
    return null;
  },
});
