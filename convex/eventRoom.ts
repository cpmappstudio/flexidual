import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./users";
import { canAccessEvent } from "./model/eventAccess";
import {
  findEventRoom,
  getEventLeaderRole,
  getEventRoomAccess,
} from "./model/eventRoomAccess";
import {
  getEventActivationId,
  getEventLiveRoomName,
  ensureEventActivation,
} from "./model/liveActivation";
import {
  liveLifecycleSnapshotValidator,
  matchesLiveLifecycleSnapshot,
} from "./model/liveLifecycle";
import {
  canReopenLiveSession,
  canStartLiveSession,
  getConfirmedExtensionEnd,
  getEffectiveLiveEnd,
  getLiveSessionHardEnd,
  getLiveSessionReopenUntil,
  getLiveSessionStartAvailableAt,
  LIVE_EXTENSION_PROMPT_LEAD_MS,
  STUDENT_ONLY_GRACE_MS,
} from "../lib/live-session-policy";
import { sessionLeaderRoleValidator } from "./model/sessionLeadership";
import { scheduleLiveReconciliation } from "./model/liveReconciliation";
import { deleteWhiteboardSession } from "./model/whiteboardCleanup";
import { clearWhiteboardRecordingTokens } from "./model/whiteboardRecording";

type DbCtx = QueryCtx | MutationCtx;
type Occurrence = Doc<"eventOccurrences">;

function runtimeExtensionEnd(occurrence: Occurrence) {
  const effectiveEnd = getEffectiveLiveEnd(
    occurrence.scheduledEnd,
    occurrence.liveExtensionEndsAt,
  );
  return occurrence.status === "active" &&
    occurrence.sessionReopenedAt !== undefined &&
    occurrence.sessionReopenUntil !== undefined &&
    occurrence.sessionReopenedAt >= effectiveEnd
    ? occurrence.sessionReopenUntil
    : occurrence.liveExtensionEndsAt;
}

function sessionStatus(occurrence: Occurrence, timeZone: string, now: number) {
  const hardEnd = getLiveSessionHardEnd(occurrence.scheduledEnd);
  return {
    occurrenceId: occurrence._id,
    isActive:
      (now >= occurrence.scheduledStart - 10 * 60_000 &&
        now <= occurrence.scheduledEnd + 5 * 60_000) ||
      (occurrence.status === "active" && now < hardEnd),
    isLive: occurrence.isLive === true,
    status: occurrence.status,
    start: occurrence.scheduledStart,
    end: occurrence.scheduledEnd,
    timeZone,
    roomName: occurrence.roomName,
    canJoin:
      occurrence.status === "active" || occurrence.status === "scheduled",
    liveExtensionEndsAt: runtimeExtensionEnd(occurrence),
    liveDecisionEndsAt: occurrence.liveDecisionEndsAt,
    liveHardEndsAt: hardEnd,
    activationStartedAt:
      occurrence.sessionReopenedAt ?? occurrence.sessionStartedAt,
    activationId: getEventActivationId(occurrence),
    liveRoomName: getEventLiveRoomName(occurrence),
    hasReopened: occurrence.sessionReopenedAt !== undefined,
    sessionClosing: occurrence.liveEndClaimId !== undefined,
    sessionCloseRetrying: occurrence.liveCleanupRetrying === true,
  };
}

const sessionStatusValidator = v.object({
  occurrenceId: v.id("eventOccurrences"),
  isActive: v.boolean(),
  isLive: v.boolean(),
  status: v.union(
    v.literal("scheduled"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  roomName: v.string(),
  canJoin: v.boolean(),
  liveExtensionEndsAt: v.optional(v.number()),
  liveDecisionEndsAt: v.optional(v.number()),
  liveHardEndsAt: v.number(),
  activationStartedAt: v.optional(v.number()),
  activationId: v.string(),
  liveRoomName: v.string(),
  hasReopened: v.boolean(),
  sessionClosing: v.boolean(),
  sessionCloseRetrying: v.boolean(),
});

async function requireEventRoom(ctx: DbCtx, roomName: string) {
  const room = await findEventRoom(ctx, roomName);
  if (!room) throw new ConvexError("Event occurrence not found");
  return room;
}

async function requireEventLeader(ctx: MutationCtx, roomName: string) {
  const user = await getCurrentUserOrThrow(ctx);
  const room = await requireEventRoom(ctx, roomName);
  const role = await getEventLeaderRole(ctx, user._id, room.event);
  if (!role || !(await canAccessEvent(ctx, user._id, room.event)))
    throw new ConvexError("PERMISSION_DENIED");
  return { ...room, user, role };
}

function assertActive(occurrence: Occurrence) {
  if (occurrence.status !== "active" || occurrence.isLive !== true)
    throw new ConvexError("The event is not live");
}

async function assignLeader(
  ctx: MutationCtx,
  occurrence: Occurrence,
  userId: Id<"users">,
  role: NonNullable<Awaited<ReturnType<typeof getEventLeaderRole>>>,
  now: number,
) {
  await ctx.db.patch("eventOccurrences", occurrence._id, {
    sessionLeaderId: userId,
    sessionLeaderRole: role,
    sessionLeaderSince: now,
    sessionTransferToId: undefined,
    sessionTransferRequestedBy: undefined,
    sessionTransferRequestedAt: undefined,
    liveLeaderAbsentSince: undefined,
  });
}

export const getSessionStatus = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      ...sessionStatusValidator.fields,
      eventId: v.id("events"),
      eventTitle: v.string(),
      roomAdmin: v.boolean(),
      isPrimaryTeacher: v.boolean(),
      isSessionLeader: v.boolean(),
      leadershipRole: v.union(sessionLeaderRoleValidator, v.null()),
      canStart: v.boolean(),
      canReopen: v.boolean(),
      startAvailableAt: v.number(),
      reopenUntil: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      endedByName: v.optional(v.string()),
      endedAutomatically: v.boolean(),
    }),
  ),
  handler: async (ctx, { roomName, now }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const room = await findEventRoom(ctx, roomName);
    if (!room) return null;
    const access = await getEventRoomAccess(
      ctx,
      user._id,
      room.event,
      room.occurrence,
    );
    if (!access.authorized) return null;
    const occurrence = room.occurrence;
    const endedBy = occurrence.sessionEndedBy
      ? await ctx.db.get("users", occurrence.sessionEndedBy)
      : null;
    return {
      ...sessionStatus(occurrence, room.event.timeZone, now),
      eventId: room.event._id,
      eventTitle: room.event.title,
      roomAdmin: access.roomAdmin,
      isPrimaryTeacher: access.isPrimaryTeacher,
      isSessionLeader: access.isSessionLeader,
      leadershipRole: access.leadershipRole,
      canStart:
        access.leadershipRole !== null &&
        canStartLiveSession({
          now,
          scheduledStart: occurrence.scheduledStart,
          scheduledEnd: occurrence.scheduledEnd,
          status: occurrence.status,
          isLive: occurrence.isLive === true,
          sessionStartedAt: occurrence.sessionStartedAt,
        }),
      canReopen:
        access.leadershipRole !== null &&
        canReopenLiveSession({
          now,
          scheduledStart: occurrence.scheduledStart,
          scheduledEnd: occurrence.scheduledEnd,
          status: occurrence.status,
          isLive: occurrence.isLive === true,
          sessionStartedAt: occurrence.sessionStartedAt,
          sessionReopenUntil: occurrence.sessionReopenUntil,
        }),
      startAvailableAt: getLiveSessionStartAvailableAt(
        occurrence.scheduledStart,
      ),
      reopenUntil:
        access.leadershipRole !== null
          ? occurrence.sessionReopenUntil
          : undefined,
      endedAt:
        access.leadershipRole !== null ? occurrence.completedAt : undefined,
      endedByName:
        access.leadershipRole !== null ? endedBy?.fullName : undefined,
      endedAutomatically:
        access.leadershipRole !== null &&
        occurrence.status === "completed" &&
        !occurrence.sessionEndedBy,
    };
  },
});

export const checkLiveKitAccess = internalQuery({
  args: { userId: v.id("users"), roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      authorized: v.boolean(),
      roomAdmin: v.boolean(),
      isPrimaryTeacher: v.boolean(),
      isSessionLeader: v.boolean(),
      leadershipRole: v.union(sessionLeaderRoleValidator, v.null()),
      canJoinEarly: v.boolean(),
      computedRole: v.union(
        v.literal("teacher"),
        v.literal("admin"),
        v.literal("student"),
      ),
      session: sessionStatusValidator,
    }),
  ),
  handler: async (ctx, { userId, roomName, now }) => {
    const room = await findEventRoom(ctx, roomName);
    if (!room) return null;
    return {
      ...(await getEventRoomAccess(ctx, userId, room.event, room.occurrence)),
      session: sessionStatus(room.occurrence, room.event.timeZone, now),
    };
  },
});

export const start = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, user, role } = await requireEventLeader(ctx, roomName);
    const now = Date.now();
    if (
      !canStartLiveSession({
        now,
        scheduledStart: occurrence.scheduledStart,
        scheduledEnd: occurrence.scheduledEnd,
        status: occurrence.status,
        isLive: occurrence.isLive === true,
        sessionStartedAt: occurrence.sessionStartedAt,
      })
    )
      throw new ConvexError("SESSION_START_NOT_AVAILABLE");
    const liveActivationGeneration =
      (occurrence.liveActivationGeneration ?? 0) + 1;
    const activationId = `event:${occurrence._id}:${liveActivationGeneration}`;
    await assignLeader(ctx, occurrence, user._id, role, now);
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      status: "active",
      isLive: true,
      sessionStartedAt: now,
      sessionReopenedAt: undefined,
      sessionReopenUntil: undefined,
      sessionEndedBy: undefined,
      completedAt: undefined,
      liveActivationId: activationId,
      liveActivationGeneration,
      liveRoomName: `event-${occurrence._id}-live-${activationId}`,
      liveEndClaimId: undefined,
      liveCleanupRetrying: undefined,
      liveExtensionEndsAt: undefined,
      liveDecisionEndsAt: undefined,
      liveLastReconciledAt: undefined,
    });
    await scheduleLiveReconciliation(
      ctx,
      roomName,
      occurrence.scheduledEnd,
      activationId,
    );
    return null;
  },
});

export const reopen = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, user, role } = await requireEventLeader(ctx, roomName);
    const now = Date.now();
    if (
      !canReopenLiveSession({
        now,
        scheduledStart: occurrence.scheduledStart,
        scheduledEnd: occurrence.scheduledEnd,
        status: occurrence.status,
        isLive: occurrence.isLive === true,
        sessionStartedAt: occurrence.sessionStartedAt,
        sessionReopenUntil: occurrence.sessionReopenUntil,
      })
    )
      throw new ConvexError("SESSION_REOPEN_NOT_AVAILABLE");
    const liveActivationGeneration =
      (occurrence.liveActivationGeneration ?? 0) + 1;
    const activationId = `event:${occurrence._id}:${liveActivationGeneration}`;
    const previousEnd =
      occurrence.liveExtensionEndsAt ?? occurrence.scheduledEnd;
    const resumedEnd =
      now >= previousEnd ? occurrence.sessionReopenUntil : previousEnd;
    await assignLeader(ctx, occurrence, user._id, role, now);
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      status: "active",
      isLive: true,
      completedAt: undefined,
      sessionReopenedAt: now,
      liveActivationId: activationId,
      liveActivationGeneration,
      liveRoomName: `event-${occurrence._id}-live-${activationId}`,
      liveEndClaimId: undefined,
      liveCleanupRetrying: undefined,
      liveLeaderAbsentSince: undefined,
      liveDecisionEndsAt: undefined,
      liveLastReconciledAt: undefined,
    });
    await scheduleLiveReconciliation(
      ctx,
      roomName,
      occurrence.scheduledEnd,
      activationId,
      resumedEnd,
    );
    return null;
  },
});

const leadershipValidator = v.union(
  v.null(),
  v.object({
    occurrenceId: v.id("eventOccurrences"),
    leader: v.union(
      v.null(),
      v.object({
        userId: v.id("users"),
        participantIdentity: v.string(),
        fullName: v.string(),
        imageUrl: v.optional(v.string()),
        role: sessionLeaderRoleValidator,
        since: v.number(),
      }),
    ),
    pendingTransfer: v.union(
      v.null(),
      v.object({
        targetUserId: v.id("users"),
        targetName: v.string(),
        requestedByName: v.string(),
        requestedAt: v.number(),
      }),
    ),
    latestTransferOutcome: v.union(
      v.null(),
      v.object({
        eventId: v.string(),
        status: v.union(v.literal("accepted"), v.literal("rejected")),
        responderName: v.string(),
        respondedAt: v.number(),
      }),
    ),
    viewer: v.object({
      userId: v.id("users"),
      isLeader: v.boolean(),
      isPrimaryTeacher: v.boolean(),
      canClaim: v.boolean(),
      canRecover: v.boolean(),
      canTransfer: v.boolean(),
      canAcceptTransfer: v.boolean(),
      canTakeover: v.boolean(),
    }),
  }),
);

export const getSessionLeadership = query({
  args: { roomName: v.string(), now: v.number() },
  returns: leadershipValidator,
  handler: async (ctx, { roomName, now }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const room = await findEventRoom(ctx, roomName);
    if (!room) return null;
    const { occurrence, event } = room;
    const access = await getEventRoomAccess(ctx, user._id, event, occurrence);
    if (!access.authorized) throw new ConvexError("PERMISSION_DENIED");
    const outcome = occurrence.sessionTransferOutcome;
    const [leader, target, requester, responder] = await Promise.all([
      occurrence.sessionLeaderId
        ? ctx.db.get("users", occurrence.sessionLeaderId)
        : null,
      occurrence.sessionTransferToId
        ? ctx.db.get("users", occurrence.sessionTransferToId)
        : null,
      occurrence.sessionTransferRequestedBy
        ? ctx.db.get("users", occurrence.sessionTransferRequestedBy)
        : null,
      outcome?.responderId ? ctx.db.get("users", outcome.responderId) : null,
    ]);
    const live = occurrence.status === "active" && occurrence.isLive === true;
    const canLead = access.leadershipRole !== null;
    const isLeader = access.isSessionLeader;
    return {
      occurrenceId: occurrence._id,
      leader:
        leader && occurrence.sessionLeaderRole && occurrence.sessionLeaderSince
          ? {
              userId: leader._id,
              participantIdentity: leader.clerkId,
              fullName: leader.fullName,
              imageUrl: leader.imageUrl,
              role: occurrence.sessionLeaderRole,
              since: occurrence.sessionLeaderSince,
            }
          : null,
      pendingTransfer:
        target && requester && occurrence.sessionTransferRequestedAt
          ? {
              targetUserId: target._id,
              targetName: target.fullName,
              requestedByName: requester.fullName,
              requestedAt: occurrence.sessionTransferRequestedAt,
            }
          : null,
      latestTransferOutcome:
        outcome &&
        outcome.requesterId === user._id &&
        outcome.at >= now - 2 * 60_000 &&
        responder
          ? {
              eventId: `${occurrence._id}:${occurrence.sessionTransferOutcomeSequence ?? 0}`,
              status: outcome.status,
              responderName: responder.fullName,
              respondedAt: outcome.at,
            }
          : null,
      viewer: {
        userId: user._id,
        isLeader,
        isPrimaryTeacher: access.isPrimaryTeacher,
        canClaim: canLead && live && !occurrence.sessionLeaderId,
        canRecover:
          access.isPrimaryTeacher &&
          live &&
          !!occurrence.sessionLeaderId &&
          !isLeader,
        canTransfer: isLeader && live,
        canAcceptTransfer: live && occurrence.sessionTransferToId === user._id,
        canTakeover:
          canLead &&
          live &&
          !isLeader &&
          occurrence.liveLeaderAbsentSince !== undefined &&
          now >= occurrence.liveLeaderAbsentSince + STUDENT_ONLY_GRACE_MS,
      },
    };
  },
});

export const claimSessionLeadership = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, user, role } = await requireEventLeader(ctx, roomName);
    assertActive(occurrence);
    if (occurrence.sessionLeaderId) {
      if (occurrence.sessionLeaderId === user._id) return null;
      throw new ConvexError("This event already has a session leader");
    }
    await assignLeader(ctx, occurrence, user._id, role, Date.now());
    return null;
  },
});

export const requestSessionLeadershipTransfer = mutation({
  args: { roomName: v.string(), targetUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { roomName, targetUserId }) => {
    const { occurrence, event, user } = await requireEventLeader(ctx, roomName);
    assertActive(occurrence);
    if (occurrence.sessionLeaderId !== user._id || targetUserId === user._id)
      throw new ConvexError("PERMISSION_DENIED");
    const target = await ctx.db.get("users", targetUserId);
    if (
      !target?.isActive ||
      !(await canAccessEvent(ctx, targetUserId, event)) ||
      !(await getEventLeaderRole(ctx, targetUserId, event))
    )
      throw new ConvexError("Target user cannot lead this event");
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      sessionTransferToId: targetUserId,
      sessionTransferRequestedBy: user._id,
      sessionTransferRequestedAt: Date.now(),
    });
    return null;
  },
});

export const cancelSessionLeadershipTransfer = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, user } = await requireEventLeader(ctx, roomName);
    assertActive(occurrence);
    if (occurrence.sessionLeaderId !== user._id)
      throw new ConvexError("PERMISSION_DENIED");
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      sessionTransferToId: undefined,
      sessionTransferRequestedBy: undefined,
      sessionTransferRequestedAt: undefined,
    });
    return null;
  },
});

export const rejectSessionLeadershipTransfer = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const { occurrence, event } = await requireEventRoom(ctx, roomName);
    assertActive(occurrence);
    if (
      occurrence.sessionTransferToId !== user._id ||
      !(await canAccessEvent(ctx, user._id, event))
    )
      throw new ConvexError("PERMISSION_DENIED");
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      sessionTransferOutcomeSequence:
        (occurrence.sessionTransferOutcomeSequence ?? 0) + 1,
      sessionTransferOutcome: occurrence.sessionTransferRequestedBy
        ? {
            requesterId: occurrence.sessionTransferRequestedBy,
            responderId: user._id,
            status: "rejected",
            at: Date.now(),
          }
        : undefined,
      sessionTransferToId: undefined,
      sessionTransferRequestedBy: undefined,
      sessionTransferRequestedAt: undefined,
    });
    return null;
  },
});

export const acceptSessionLeadershipTransfer = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, event, user, role } = await requireEventLeader(
      ctx,
      roomName,
    );
    assertActive(occurrence);
    if (
      occurrence.sessionTransferToId !== user._id ||
      !occurrence.sessionTransferRequestedBy
    )
      throw new ConvexError("PERMISSION_DENIED");
    if (!(await canAccessEvent(ctx, user._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    const requesterId = occurrence.sessionTransferRequestedBy;
    const now = Date.now();
    await assignLeader(ctx, occurrence, user._id, role, now);
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      sessionTransferOutcomeSequence:
        (occurrence.sessionTransferOutcomeSequence ?? 0) + 1,
      sessionTransferOutcome: {
        requesterId,
        responderId: user._id,
        status: "accepted",
        at: now,
      },
    });
    return null;
  },
});

export const recoverSessionLeadership = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, user, role } = await requireEventLeader(ctx, roomName);
    assertActive(occurrence);
    if (role !== "teacher") throw new ConvexError("PERMISSION_DENIED");
    if (occurrence.sessionLeaderId === user._id) return null;
    await assignLeader(ctx, occurrence, user._id, role, Date.now());
    return null;
  },
});

export const takeOverSessionLeadership = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    const { occurrence, user, role } = await requireEventLeader(ctx, roomName);
    assertActive(occurrence);
    if (occurrence.sessionLeaderId === user._id) return null;
    if (
      occurrence.liveLeaderAbsentSince === undefined ||
      Date.now() < occurrence.liveLeaderAbsentSince + STUDENT_ONLY_GRACE_MS
    )
      throw new ConvexError("The current leader is still responsible");
    await assignLeader(ctx, occurrence, user._id, role, Date.now());
    return null;
  },
});

export const getLiveExtensionContext = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      effectiveEnd: v.number(),
      proposedEnd: v.number(),
      warningStartsAt: v.number(),
      decisionEndsAt: v.optional(v.number()),
      hardEndsAt: v.number(),
      affectedStudentCount: v.number(),
      staffConflict: v.optional(
        v.object({ className: v.string(), startsAt: v.number() }),
      ),
    }),
  ),
  handler: async (ctx, { roomName }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const room = await findEventRoom(ctx, roomName);
    if (!room || room.occurrence.status !== "active" || !room.occurrence.isLive)
      return null;
    const access = await getEventRoomAccess(
      ctx,
      user._id,
      room.event,
      room.occurrence,
    );
    if (!access.isSessionLeader) return null;
    const occurrence = room.occurrence;
    const effectiveEnd = getEffectiveLiveEnd(
      occurrence.scheduledEnd,
      runtimeExtensionEnd(occurrence),
    );
    return {
      effectiveEnd,
      proposedEnd: getConfirmedExtensionEnd(
        effectiveEnd,
        occurrence.scheduledEnd,
      ),
      warningStartsAt: effectiveEnd - LIVE_EXTENSION_PROMPT_LEAD_MS,
      decisionEndsAt: occurrence.liveDecisionEndsAt,
      hardEndsAt: getLiveSessionHardEnd(occurrence.scheduledEnd),
      affectedStudentCount: 0,
      staffConflict: undefined,
    };
  },
});

export const getAttendeeExtensionContext = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      effectiveEnd: v.number(),
      warningStartsAt: v.number(),
      extensionEndsAt: v.optional(v.number()),
      nextClass: v.optional(
        v.object({
          scheduleId: v.id("classSchedule"),
          className: v.string(),
          roomName: v.string(),
          startsAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { roomName }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const room = await findEventRoom(ctx, roomName);
    if (!room || room.occurrence.status !== "active" || !room.occurrence.isLive)
      return null;
    if (!(await canAccessEvent(ctx, user._id, room.event))) return null;
    const extensionEndsAt = runtimeExtensionEnd(room.occurrence);
    const effectiveEnd = getEffectiveLiveEnd(
      room.occurrence.scheduledEnd,
      extensionEndsAt,
    );
    return {
      effectiveEnd,
      warningStartsAt: effectiveEnd - LIVE_EXTENSION_PROMPT_LEAD_MS,
      extensionEndsAt,
      nextClass: undefined,
    };
  },
});

export const confirmLiveExtension = mutation({
  args: { roomName: v.string(), expectedActivationId: v.optional(v.string()) },
  returns: v.object({ extensionEndsAt: v.number(), hardEndsAt: v.number() }),
  handler: async (ctx, { roomName, expectedActivationId }) => {
    const { occurrence, user } = await requireEventLeader(ctx, roomName);
    assertActive(occurrence);
    if (
      occurrence.sessionLeaderId !== user._id ||
      occurrence.liveDecisionEndsAt === undefined
    )
      throw new ConvexError("PERMISSION_DENIED");
    if (
      (expectedActivationId &&
        getEventActivationId(occurrence) !== expectedActivationId) ||
      (!expectedActivationId && occurrence.sessionReopenedAt !== undefined)
    )
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    if (Date.now() >= occurrence.liveDecisionEndsAt)
      throw new ConvexError("The decision window has already ended");
    const currentEnd = getEffectiveLiveEnd(
      occurrence.scheduledEnd,
      runtimeExtensionEnd(occurrence),
    );
    const extensionEndsAt = getConfirmedExtensionEnd(
      currentEnd,
      occurrence.scheduledEnd,
    );
    if (extensionEndsAt <= currentEnd)
      throw new ConvexError("The live session reached its maximum duration");
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      liveExtensionEndsAt: extensionEndsAt,
      liveLeaderAbsentSince: undefined,
      liveDecisionEndsAt: undefined,
    });
    await ctx.scheduler.runAt(
      extensionEndsAt,
      internal.livekit.reconcileLiveSession,
      { roomName, expectedActivationId: getEventActivationId(occurrence) },
    );
    return {
      extensionEndsAt,
      hardEndsAt: getLiveSessionHardEnd(occurrence.scheduledEnd),
    };
  },
});

const lifecycleValidator = v.union(
  v.null(),
  v.object({
    roomName: v.string(),
    scheduledEnd: v.number(),
    isLive: v.boolean(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    liveLeaderAbsentSince: v.optional(v.number()),
    liveExtensionEndsAt: v.optional(v.number()),
    liveDecisionEndsAt: v.optional(v.number()),
    sessionLeaderId: v.optional(v.id("users")),
    activationId: v.string(),
    liveRoomName: v.string(),
    hasReopened: v.boolean(),
    sessionStartedAt: v.optional(v.number()),
    sessionLeaderSince: v.optional(v.number()),
  }),
);

export const getLiveLifecycleState = internalQuery({
  args: { roomName: v.string() },
  returns: lifecycleValidator,
  handler: async (ctx, { roomName }) => {
    const room = await findEventRoom(ctx, roomName);
    if (!room) return null;
    const occurrence = room.occurrence;
    return {
      roomName,
      scheduledEnd: occurrence.scheduledEnd,
      isLive: occurrence.isLive === true,
      status: occurrence.status,
      liveLeaderAbsentSince: occurrence.liveLeaderAbsentSince,
      liveExtensionEndsAt: runtimeExtensionEnd(occurrence),
      liveDecisionEndsAt: occurrence.liveDecisionEndsAt,
      sessionLeaderId: occurrence.sessionLeaderId,
      activationId: getEventActivationId(occurrence),
      liveRoomName: getEventLiveRoomName(occurrence),
      hasReopened: occurrence.sessionReopenedAt !== undefined,
      sessionStartedAt: occurrence.sessionStartedAt,
      sessionLeaderSince: occurrence.sessionLeaderSince,
    };
  },
});

export const updateLiveLifecycleState = internalMutation({
  args: {
    roomName: v.string(),
    expectedActivationId: v.string(),
    expectedState: v.optional(liveLifecycleSnapshotValidator),
    reconciledAt: v.number(),
    expectedLeaderAbsentSince: v.union(v.number(), v.null()),
    expectedExtensionEndsAt: v.union(v.number(), v.null()),
    expectedDecisionEndsAt: v.union(v.number(), v.null()),
    leaderAbsentSince: v.union(v.number(), v.null()),
    extensionEndsAt: v.union(v.number(), v.null()),
    decisionEndsAt: v.union(v.number(), v.null()),
    nextCheckAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const occurrence = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .unique();
    if (!occurrence) return false;
    if (
      occurrence.status !== "active" ||
      !occurrence.isLive ||
      getEventActivationId(occurrence) !== args.expectedActivationId
    )
      return false;
    const extensionEnd = runtimeExtensionEnd(occurrence);
    if (
      (args.expectedState &&
        !matchesLiveLifecycleSnapshot(
          { ...occurrence, liveExtensionEndsAt: extensionEnd },
          args.expectedState,
        )) ||
      (occurrence.liveLeaderAbsentSince ?? null) !==
        args.expectedLeaderAbsentSince ||
      (extensionEnd ?? null) !== args.expectedExtensionEndsAt ||
      (occurrence.liveDecisionEndsAt ?? null) !== args.expectedDecisionEndsAt
    )
      return false;
    if (
      (occurrence.liveLeaderAbsentSince ?? null) === args.leaderAbsentSince &&
      (extensionEnd ?? null) === args.extensionEndsAt &&
      (occurrence.liveDecisionEndsAt ?? null) === args.decisionEndsAt
    )
      return true;
    const introducesDeadline =
      (args.leaderAbsentSince !== null &&
        args.leaderAbsentSince !== occurrence.liveLeaderAbsentSince) ||
      (args.extensionEndsAt !== null &&
        args.extensionEndsAt !== extensionEnd) ||
      (args.decisionEndsAt !== null &&
        args.decisionEndsAt !== occurrence.liveDecisionEndsAt);
    const extensionToPersist =
      extensionEnd !== occurrence.liveExtensionEndsAt &&
      args.extensionEndsAt === extensionEnd
        ? occurrence.liveExtensionEndsAt
        : (args.extensionEndsAt ?? undefined);
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      liveLeaderAbsentSince: args.leaderAbsentSince ?? undefined,
      liveExtensionEndsAt: extensionToPersist,
      liveDecisionEndsAt: args.decisionEndsAt ?? undefined,
      liveLastReconciledAt: args.reconciledAt,
    });
    if (
      introducesDeadline &&
      args.nextCheckAt < getLiveSessionHardEnd(occurrence.scheduledEnd)
    )
      await ctx.scheduler.runAt(
        Math.max(args.reconciledAt, args.nextCheckAt),
        internal.livekit.reconcileLiveSession,
        {
          roomName: args.roomName,
          expectedActivationId: args.expectedActivationId,
        },
      );
    return true;
  },
});

export const claimLiveSessionEnd = internalMutation({
  args: {
    roomName: v.string(),
    expectedActivationId: v.string(),
    claimId: v.string(),
    endedAt: v.number(),
    endedBy: v.optional(v.id("users")),
    expectedState: v.optional(liveLifecycleSnapshotValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const room = await findEventRoom(ctx, args.roomName);
    if (!room) return false;
    const occurrence = room.occurrence;
    if (
      occurrence.status !== "active" ||
      !occurrence.isLive ||
      occurrence.liveEndClaimId !== undefined ||
      getEventActivationId(occurrence) !== args.expectedActivationId
    )
      return false;
    if (
      args.expectedState &&
      !matchesLiveLifecycleSnapshot(
        {
          ...occurrence,
          liveExtensionEndsAt: runtimeExtensionEnd(occurrence),
        },
        args.expectedState,
      )
    )
      return false;
    if (
      args.endedBy &&
      (occurrence.sessionLeaderId !== args.endedBy ||
        !(await ctx.db.get("users", args.endedBy))?.isActive)
    )
      return false;
    const activation = await ensureEventActivation(ctx, occurrence);
    const cleanupJobId = await ctx.scheduler.runAfter(
      0,
      internal.livekit.cleanupActivation,
      { activationId: args.expectedActivationId },
    );
    await ctx.db.patch("liveRoomActivations", activation._id, {
      status: "closing",
      claimId: args.claimId,
      cleanupJobId,
      nextCleanupAt: args.endedAt + 60_000,
    });
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      status: "completed",
      isLive: false,
      completedAt: args.endedAt,
      sessionEndedBy: args.endedBy,
      sessionReopenUntil: undefined,
      liveEndClaimId: args.claimId,
      liveCleanupRetrying: undefined,
      liveLeaderAbsentSince: undefined,
      liveDecisionEndsAt: undefined,
      liveLastReconciledAt: args.endedAt,
    });
    await clearWhiteboardRecordingTokens(ctx, args.roomName);
    const reopenUntil = getLiveSessionReopenUntil(
      occurrence.scheduledEnd,
      occurrence.liveExtensionEndsAt,
    );
    await ctx.scheduler.runAt(
      Math.max(args.endedAt, reopenUntil),
      internal.eventRoom.cleanupExpiredWhiteboardSession,
      { roomName: args.roomName, expectedReopenUntil: reopenUntil },
    );
    return true;
  },
});

export const completeLiveSessionEnd = internalMutation({
  args: {
    roomName: v.string(),
    expectedActivationId: v.string(),
    claimId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const occurrence = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .unique();
    if (!occurrence) return false;
    if (
      occurrence.status !== "completed" ||
      occurrence.isLive ||
      occurrence.liveEndClaimId !== args.claimId ||
      getEventActivationId(occurrence) !== args.expectedActivationId
    )
      return false;
    await ctx.db.patch("eventOccurrences", occurrence._id, {
      sessionReopenUntil: getLiveSessionReopenUntil(
        occurrence.scheduledEnd,
        occurrence.liveExtensionEndsAt,
      ),
      liveEndClaimId: undefined,
      liveCleanupRetrying: undefined,
    });
    return true;
  },
});

export const cleanupExpiredWhiteboardSession = internalMutation({
  args: { roomName: v.string(), expectedReopenUntil: v.number() },
  returns: v.null(),
  handler: async (ctx, { roomName, expectedReopenUntil }) => {
    const room = await findEventRoom(ctx, roomName);
    if (!room) return null;
    const occurrence = room.occurrence;
    if (
      occurrence.isLive ||
      occurrence.status !== "completed" ||
      (occurrence.sessionReopenUntil ??
        getLiveSessionReopenUntil(
          occurrence.scheduledEnd,
          occurrence.liveExtensionEndsAt,
        )) !== expectedReopenUntil ||
      Date.now() < expectedReopenUntil
    )
      return null;
    await deleteWhiteboardSession(ctx, roomName);
    return null;
  },
});

export const listActiveLiveSessions = internalQuery({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      roomName: v.string(),
      scheduledEnd: v.number(),
      activationId: v.string(),
    }),
  ),
  handler: async (ctx, { limit }) => {
    const occurrences = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_status_and_is_live", (q) =>
        q.eq("status", "active").eq("isLive", true),
      )
      .take(Math.min(Math.max(limit, 1), 200));
    return occurrences.map((occurrence) => ({
      roomName: occurrence.roomName,
      scheduledEnd: occurrence.scheduledEnd,
      activationId: getEventActivationId(occurrence),
    }));
  },
});
