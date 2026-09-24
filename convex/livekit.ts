"use node";

import { ConvexError, v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { LiveDecisionSnapshot } from "./model/liveActivation";
import { randomUUID } from "node:crypto";
import {
  evaluateLiveSession,
  getLiveParticipantSnapshot,
  getLiveSessionHardEnd,
} from "../lib/live-session-policy";
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  EgressStatus,
  RoomServiceClient,
  TrackSource,
  WebhookConfig,
  WebhookReceiver,
} from "livekit-server-sdk";

async function requireActiveUser(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");

  const user = await ctx.runQuery(internal.users.getUserByClerkIdInternal, {
    clerkId: identity.subject,
  });
  if (!user) throw new ConvexError("User not found");
  if (!user.isActive) throw new ConvexError("Account inactive");

  return { identity, user };
}

async function requireRoomAdministrator(ctx: ActionCtx, roomName: string) {
  const { user } = await requireActiveUser(ctx);

  const access = await ctx.runQuery(internal.schedule.checkLiveKitAccess, {
    userId: user._id,
    roomName,
    now: Date.now(),
  });
  if (!access?.authorized || !access.roomAdmin) {
    throw new ConvexError("Only a room administrator can perform this action");
  }
  return access;
}

async function requireSessionLeader(ctx: ActionCtx, roomName: string) {
  const { user } = await requireActiveUser(ctx);
  const access = await ctx.runQuery(internal.schedule.checkLiveKitAccess, {
    userId: user._id,
    roomName,
    now: Date.now(),
  });
  if (!access?.authorized || !access.isSessionLeader) {
    throw new ConvexError("Only the session leader can end this class");
  }
  return { access, user };
}

function getLiveKitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

function assertActivation(
  session: { activationId: string; hasReopened: boolean },
  expected?: string,
) {
  if (
    (expected && expected !== session.activationId) ||
    (!expected && session.hasReopened)
  ) {
    throw new ConvexError("STALE_LIVE_ACTIVATION");
  }
}

async function stopActiveRoomEgresses(
  egressClient: EgressClient,
  roomName: string,
) {
  const egresses = await egressClient.listEgress({ roomName });
  const activeEgresses = egresses.filter(
    (egress) =>
      egress.status === EgressStatus.EGRESS_STARTING ||
      egress.status === EgressStatus.EGRESS_ACTIVE,
  );
  await Promise.all(
    activeEgresses.map((egress) => egressClient.stopEgress(egress.egressId)),
  );
}

async function deleteRoomIfPresent(
  roomClient: RoomServiceClient,
  roomName: string,
) {
  const rooms = await roomClient.listRooms([roomName]);
  if (rooms.length === 0) return;

  try {
    await roomClient.deleteRoom(roomName);
  } catch (error) {
    const remainingRooms = await roomClient.listRooms([roomName]);
    if (remainingRooms.length > 0) throw error;
  }
}

type LiveKitClients = {
  roomClient: RoomServiceClient;
  egressClient: EgressClient;
};

function createLiveKitClients(
  config: NonNullable<ReturnType<typeof getLiveKitConfig>>,
): LiveKitClients {
  return {
    roomClient: new RoomServiceClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    ),
    egressClient: new EgressClient(config.url, config.apiKey, config.apiSecret),
  };
}

async function finalizeLiveSession(
  ctx: ActionCtx,
  roomName: string,
  expectedActivationId: string,
  endedAt: number,
  endedBy?: Id<"users">,
  expectedState?: LiveDecisionSnapshot,
) {
  const claimId = randomUUID();
  const claimed = await ctx.runMutation(internal.schedule.claimLiveSessionEnd, {
    roomName,
    expectedActivationId,
    claimId,
    endedAt,
    endedBy,
    expectedState,
  });
  if (!claimed && expectedState) {
    await ctx.scheduler.runAfter(1_000, internal.livekit.reconcileLiveSession, {
      roomName,
      expectedActivationId,
    });
  }
  return claimed;
}

export const cleanupActivation = internalAction({
  args: { activationId: v.string() },
  returns: v.null(),
  handler: async (ctx, { activationId }): Promise<null> => {
    const activation = await ctx.runMutation(
      internal.liveRoomLifecycle.prepareCleanup,
      { activationId },
    );
    let error: string | undefined;
    try {
      if (!activation)
        throw new Error("Waiting for recording operation to finish");
      const config = getLiveKitConfig();
      if (!config) throw new Error("LiveKit credentials are not configured");
      const clients = createLiveKitClients(config);
      await stopActiveRoomEgresses(
        clients.egressClient,
        activation.liveRoomName,
      );
      await deleteRoomIfPresent(clients.roomClient, activation.liveRoomName);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "LiveKit cleanup failed";
      console.error(`[LiveKit cleanup ${activationId}]`, error);
    }
    await ctx.runMutation(internal.liveRoomLifecycle.finishCleanup, {
      activationId,
      error,
    });
    return null;
  },
});

async function reconcileRoom(
  ctx: ActionCtx,
  roomName: string,
  now: number,
  clients: LiveKitClients | null,
  expectedActivationId?: string,
) {
  const session = await ctx.runQuery(internal.schedule.getLiveLifecycleState, {
    roomName,
  });
  if (!session || session.status !== "active" || !session.isLive) return;
  if (expectedActivationId === undefined && session.hasReopened) return;
  if (
    expectedActivationId !== undefined &&
    session.activationId !== expectedActivationId
  ) {
    return;
  }

  const hardEndsAt = getLiveSessionHardEnd(session.scheduledEnd);
  if (!clients) {
    if (now >= hardEndsAt) {
      await finalizeLiveSession(ctx, roomName, session.activationId, now);
    } else {
      console.warn(
        `[LiveKit Lifecycle] Credentials unavailable; skipped participant reconciliation for ${roomName}.`,
      );
    }
    return;
  }

  const rooms = await clients.roomClient.listRooms([session.liveRoomName]);
  const participants =
    rooms.length > 0
      ? await clients.roomClient.listParticipants(session.liveRoomName)
      : [];
  const decision = evaluateLiveSession({
    now,
    scheduledEnd: session.scheduledEnd,
    leaderAbsentSince: session.liveLeaderAbsentSince,
    extensionEndsAt: session.liveExtensionEndsAt,
    decisionEndsAt: session.liveDecisionEndsAt,
    participants: getLiveParticipantSnapshot(
      participants.map((participant) => participant.metadata),
      session.sessionLeaderId,
    ),
  });

  if (decision.action === "end") {
    await finalizeLiveSession(
      ctx,
      roomName,
      session.activationId,
      now,
      undefined,
      {
        scheduledEnd: session.scheduledEnd,
        sessionLeaderId: session.sessionLeaderId,
        liveLeaderAbsentSince: session.liveLeaderAbsentSince,
        liveExtensionEndsAt: session.liveExtensionEndsAt,
        liveDecisionEndsAt: session.liveDecisionEndsAt,
      },
    );
    return;
  }

  const updated = await ctx.runMutation(
    internal.schedule.updateLiveLifecycleState,
    {
      roomName,
      expectedActivationId: session.activationId,
      reconciledAt: now,
      expectedLeaderAbsentSince: session.liveLeaderAbsentSince ?? null,
      expectedExtensionEndsAt: session.liveExtensionEndsAt ?? null,
      expectedDecisionEndsAt: session.liveDecisionEndsAt ?? null,
      leaderAbsentSince: decision.leaderAbsentSince ?? null,
      extensionEndsAt: decision.extensionEndsAt ?? null,
      decisionEndsAt: decision.decisionEndsAt ?? null,
      nextCheckAt: decision.nextCheckAt,
    },
  );
  if (!updated) {
    await ctx.scheduler.runAfter(1_000, internal.livekit.reconcileLiveSession, {
      roomName,
      expectedActivationId: session.activationId,
    });
    return;
  }
}

export const getToken = action({
  args: {
    roomName: v.string(),
    expectedActivationId: v.optional(v.string()),
    isCompanion: v.optional(v.boolean()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const { identity, user } = await requireActiveUser(ctx);

    // Check backend authorization to join this specific room
    const access = await ctx.runQuery(internal.schedule.checkLiveKitAccess, {
      userId: user._id,
      roomName: args.roomName,
      now: Date.now(),
    });

    if (!access || !access.authorized) {
      throw new ConvexError("You are not authorized to join this session.");
    }
    if (args.isCompanion && !access.roomAdmin) {
      throw new ConvexError(
        "Only a room administrator can connect a companion device.",
      );
    }

    const sessionStatus = access.session;
    assertActivation(sessionStatus, args.expectedActivationId);

    if (sessionStatus.status === "cancelled") {
      throw new ConvexError("This session has been cancelled");
    }

    if (
      sessionStatus.status !== "active" ||
      !sessionStatus.isLive ||
      !sessionStatus.isActive
    ) {
      throw new ConvexError("This session has expired");
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured");
    }

    const finalRole = access.computedRole;

    const finalIdentity = args.isCompanion
      ? `${identity.subject}-companion`
      : identity.subject;

    const finalName = args.isCompanion
      ? `${user.fullName} (Companion)`
      : user.fullName;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: finalIdentity,
      name: finalName,
      ttl: "10m",
      metadata: JSON.stringify({
        role: finalRole,
        userId: identity.subject,
        convexUserId: user._id,
        fullName: user.fullName,
        imageUrl: user.imageUrl ?? null,
        isCompanion: args.isCompanion || false,
        roomAdmin: access.roomAdmin,
        leadershipRole: access.leadershipRole,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: sessionStatus.liveRoomName,
      canPublish: true,
      canPublishSources: access.roomAdmin
        ? [
            TrackSource.CAMERA,
            TrackSource.MICROPHONE,
            TrackSource.SCREEN_SHARE,
            TrackSource.SCREEN_SHARE_AUDIO,
          ]
        : [TrackSource.CAMERA, TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
    });

    return at.toJwt();
  },
});

export const startRecording = internalAction({
  args: {
    roomName: v.string(),
    activationId: v.string(),
    recordingToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const activation = await ctx.runQuery(
      internal.liveRoomLifecycle.getActivation,
      { activationId: args.activationId },
    );
    if (
      !activation ||
      activation.status !== "active" ||
      activation.recordingToken !== args.recordingToken
    )
      return null;
    const config = getLiveKitConfig();
    if (!config) throw new Error("LiveKit credentials are not configured");
    const { apiKey } = config;
    const egressClient = new EgressClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    );
    // 1. THE GUARD: Check if there is already an active/starting session for this room
    const existingEgresses = await egressClient.listEgress({
      roomName: activation.liveRoomName,
    });
    const isAlreadyRunning = existingEgresses.some(
      (e) =>
        e.status === EgressStatus.EGRESS_STARTING ||
        e.status === EgressStatus.EGRESS_ACTIVE ||
        e.status === EgressStatus.EGRESS_ENDING,
    );

    if (isAlreadyRunning) {
      return null;
    }

    // Proceed with starting the recording
    const accessKey = process.env.S3_ACCESS_KEY;
    const secret = process.env.S3_SECRET_KEY;
    const region = process.env.S3_REGION;
    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (
      !accessKey ||
      !secret ||
      !region ||
      !bucket ||
      !endpoint ||
      !publicUrl
    ) {
      throw new Error("Recording storage configuration is incomplete.");
    }

    const s3Upload = new S3Upload({
      accessKey,
      secret,
      region,
      bucket,
      endpoint,
      forcePathStyle: true,
    });

    const fileOutput = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: `recordings/${activation.scheduleId}/${Date.now()}-${randomUUID()}.mp4`,
      output: { case: "s3", value: s3Upload },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl)
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not defined in environment variables.",
      );
    const convexSiteUrl = process.env.CONVEX_SITE_URL;
    if (!convexSiteUrl) {
      throw new Error("CONVEX_SITE_URL is not available.");
    }

    const recordingToken = args.recordingToken;
    const accepted = await ctx.runMutation(
      internal.whiteboardSessions.setRecordingToken,
      {
        roomName: args.roomName,
        recordingToken,
        expectedActivationId: args.activationId,
      },
    );
    if (!accepted) return null;
    let egressInfo;
    try {
      egressInfo = await egressClient.startRoomCompositeEgress(
        activation.liveRoomName,
        fileOutput,
        {
          customBaseUrl: `${baseUrl}/recording?whiteboardToken=${encodeURIComponent(recordingToken)}&classroom=${encodeURIComponent(args.roomName)}`,
          webhooks: [
            new WebhookConfig({
              url: `${convexSiteUrl.replace(/\/$/, "")}/livekit-egress-webhook`,
              signingKey: apiKey,
            }),
          ],
        },
      );
      if (!egressInfo.egressId) {
        throw new Error("LiveKit did not return an egress identifier.");
      }
      await ctx.runMutation(internal.recordings.createRecording, {
        scheduleId: activation.scheduleId,
        roomName: args.roomName,
        egressId: egressInfo.egressId,
        startedAt: Date.now(),
        activationId: args.activationId,
        recordingToken,
      });
      const current = await ctx.runQuery(
        internal.liveRoomLifecycle.getActivation,
        { activationId: args.activationId },
      );
      if (
        current?.status !== "active" ||
        current.recordingToken !== recordingToken
      ) {
        await egressClient.stopEgress(egressInfo.egressId);
      }
    } catch (error) {
      if (egressInfo?.egressId) {
        await egressClient
          .stopEgress(egressInfo.egressId)
          .catch(() => undefined);
      }
      await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
        roomName: args.roomName,
        recordingToken: undefined,
        expectedActivationId: args.activationId,
        expectedToken: recordingToken,
      });
      throw error;
    }

    return null;
  },
});

export const toggleRecording = action({
  args: {
    roomName: v.string(),
    expectedActivationId: v.optional(v.string()),
    start: v.boolean(),
  },
  returns: v.object({ success: v.boolean(), message: v.string() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; message: string }> => {
    const access = await requireRoomAdministrator(ctx, args.roomName);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const egressClient = new EgressClient(url, apiKey, apiSecret);

    assertActivation(access.session, args.expectedActivationId);
    if (args.start) {
      const accepted = await ctx.runMutation(
        internal.liveRoomLifecycle.requestRecording,
        {
          roomName: args.roomName,
          activationId: access.session.activationId,
          recordingToken: randomUUID(),
        },
      );
      return {
        success: accepted,
        message: accepted
          ? "Recording requested"
          : "Recording is unavailable or already starting",
      };
    } else {
      const stoppedToken = await ctx.runMutation(
        internal.liveRoomLifecycle.stopRecordingIntent,
        { roomName: args.roomName, activationId: access.session.activationId },
      );
      const egresses = await egressClient.listEgress({
        roomName: access.session.liveRoomName,
      });

      const current = await ctx.runQuery(
        internal.schedule.getLiveLifecycleState,
        { roomName: args.roomName },
      );
      if (
        !current?.isLive ||
        current.activationId !== access.session.activationId
      ) {
        return { success: false, message: "This activation has ended" };
      }

      const activeEgresses = egresses.filter(
        (e) =>
          e.status === EgressStatus.EGRESS_STARTING ||
          e.status === EgressStatus.EGRESS_ACTIVE,
      );
      const isAlreadyStopping = egresses.some(
        (e) => e.status === EgressStatus.EGRESS_ENDING,
      );

      if (activeEgresses.length > 0) {
        // Stop all active egresses found for this room
        await Promise.all(
          activeEgresses.map((e) => egressClient.stopEgress(e.egressId)),
        );
      }

      if (stoppedToken)
        await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
          roomName: args.roomName,
          recordingToken: undefined,
          expectedActivationId: access.session.activationId,
          expectedToken: stoppedToken,
        });
      return activeEgresses.length > 0 || isAlreadyStopping
        ? { success: true, message: "Recording stop requested" }
        : { success: false, message: "No active recording found" };
    }
  },
});

export const setParticipantScreenSharePermission = action({
  args: {
    roomName: v.string(),
    expectedActivationId: v.optional(v.string()),
    participantIdentity: v.string(),
    allow: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireRoomAdministrator(ctx, args.roomName);
    assertActivation(access.session, args.expectedActivationId);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const roomClient = new RoomServiceClient(url, apiKey, apiSecret);
    await roomClient.updateParticipant(
      access.session.liveRoomName,
      args.participantIdentity,
      {
        permission: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canUpdateMetadata: false,
          canPublishSources: args.allow
            ? [
                TrackSource.CAMERA,
                TrackSource.MICROPHONE,
                TrackSource.SCREEN_SHARE,
                TrackSource.SCREEN_SHARE_AUDIO,
              ]
            : [TrackSource.CAMERA, TrackSource.MICROPHONE],
        },
      },
    );
    return null;
  },
});

export const endSession = action({
  args: {
    roomName: v.string(),
    expectedActivationId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, access } = await requireSessionLeader(ctx, args.roomName);
    assertActivation(access.session, args.expectedActivationId);
    const session = await ctx.runQuery(
      internal.schedule.getLiveLifecycleState,
      { roomName: args.roomName },
    );
    if (session?.sessionClosureStatus !== "completed") {
      throw new ConvexError(
        "Complete the lesson and attendance report before ending the class",
      );
    }

    const config = getLiveKitConfig();
    if (!config) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const closed = await finalizeLiveSession(
      ctx,
      args.roomName,
      access.session.activationId,
      Date.now(),
      user._id,
    );
    if (!closed) {
      const current = await ctx.runQuery(
        internal.schedule.getLiveLifecycleState,
        { roomName: args.roomName },
      );
      if (
        current?.activationId !== access.session.activationId ||
        current.status !== "completed"
      ) {
        throw new ConvexError("STALE_LIVE_ACTIVATION");
      }
    }

    return null;
  },
});

export const notifyRoomAdministratorLeft = action({
  args: { roomName: v.string(), expectedActivationId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireRoomAdministrator(ctx, args.roomName);
    assertActivation(access.session, args.expectedActivationId);
    await ctx.scheduler.runAfter(1_000, internal.livekit.reconcileLiveSession, {
      roomName: args.roomName,
      expectedActivationId: access.session.activationId,
    });
    return null;
  },
});

export const reconcileLiveSession = internalAction({
  args: {
    roomName: v.string(),
    expectedActivationId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { roomName, expectedActivationId }) => {
    const config = getLiveKitConfig();
    await reconcileRoom(
      ctx,
      roomName,
      Date.now(),
      config ? createLiveKitClients(config) : null,
      expectedActivationId,
    );
    return null;
  },
});

export const reconcileActiveSessions = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.liveRoomLifecycle.recoverClosures, {});
    const now = Date.now();
    const activeSessions = await ctx.runQuery(
      internal.schedule.listActiveLiveSessions,
      { limit: 100 },
    );
    if (activeSessions.length === 0) return null;

    const config = getLiveKitConfig();
    if (!config) {
      console.warn(
        "[LiveKit Lifecycle] Credentials are not configured; only the hard time limit can be reconciled.",
      );
    }
    const clients = config ? createLiveKitClients(config) : null;

    for (const session of activeSessions) {
      try {
        await reconcileRoom(
          ctx,
          session.roomName,
          now,
          clients,
          session.activationId,
        );
      } catch (error) {
        console.error(
          `[LiveKit Lifecycle] Failed to reconcile ${session.roomName}:`,
          error,
        );
      }
    }

    return null;
  },
});

/**
 * Internal action that verifies a LiveKit egress webhook and processes it.
 * Must live in a "use node" file because WebhookReceiver uses node:crypto.
 * Called from the /livekit-egress-webhook HTTP route in http.ts.
 */
export const processEgressWebhook = internalAction({
  args: { body: v.string(), authorization: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      error: v.string(),
      status: v.number(),
    }),
  ),
  handler: async (ctx, { body, authorization }) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error(
        "[LiveKit Webhook] Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET",
      );
      return { ok: false as const, error: "Server misconfigured", status: 500 };
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);
    let event: Awaited<ReturnType<typeof receiver.receive>>;
    try {
      event = await receiver.receive(body, authorization);
    } catch (err) {
      console.error("[LiveKit Webhook] Signature verification failed:", err);
      return { ok: false as const, error: "Unauthorized", status: 401 };
    }

    if (
      (event.event === "participant_joined" ||
        event.event === "participant_left") &&
      event.room?.name
    ) {
      const activation = await ctx.runQuery(
        internal.liveRoomLifecycle.resolveLiveRoom,
        { liveRoomName: event.room.name },
      );
      if (activation)
        await ctx.scheduler.runAfter(
          1_000,
          internal.livekit.reconcileLiveSession,
          {
            roomName: activation.roomName,
            expectedActivationId: activation.activationId,
          },
        );
    }

    if (!event.egressInfo) {
      return { ok: true as const };
    }

    const info = event.egressInfo;
    const egressId = info.egressId;

    // EgressStatus: 0=STARTING, 1=ACTIVE, 2=ENDING, 3=COMPLETE, 4=FAILED, 5=ABORTED, 6=LIMIT_REACHED
    const statusMap: Record<
      number,
      "starting" | "active" | "complete" | "failed" | "aborted"
    > = {
      0: "starting",
      1: "active",
      2: "active",
      3: "complete",
      4: "failed",
      5: "aborted",
      6: "aborted",
    };
    const numericStatus = Number(info.status);
    const status = statusMap[numericStatus] ?? "failed";

    let fileKey: string | undefined;
    let url: string | undefined;
    let durationMs: number | undefined;
    let fileSize: number | undefined;
    let completedAt: number | undefined;
    const error = info.error || undefined;
    const errorCode = info.errorCode || undefined;
    const details = info.details || undefined;

    if (
      status === "complete" &&
      info.fileResults &&
      info.fileResults.length > 0
    ) {
      const fileResult = info.fileResults[0];
      fileKey = fileResult.filename ?? undefined;
      fileSize = fileResult.size ? Number(fileResult.size) : undefined;
      durationMs = fileResult.duration
        ? Number(fileResult.duration) / 1_000_000
        : undefined;
      completedAt = Date.now();

      const r2BaseUrl = process.env.R2_PUBLIC_URL;
      if (r2BaseUrl && fileKey) {
        url = `${r2BaseUrl.replace(/\/$/, "")}/${fileKey}`;
      }
    }

    if (egressId) {
      await ctx.runMutation(internal.recordings.updateFromWebhook, {
        egressId,
        status,
        ...(fileKey !== undefined && { fileKey }),
        ...(url !== undefined && { url }),
        ...(durationMs !== undefined && { durationMs }),
        ...(fileSize !== undefined && { fileSize }),
        ...(completedAt !== undefined && { completedAt }),
        ...(error !== undefined && { error }),
        ...(errorCode !== undefined && { errorCode }),
        ...(details !== undefined && { details }),
      });
    }

    return { ok: true as const };
  },
});

export const forceCleanupEgress = internalAction({
  args: {},
  returns: v.object({ message: v.string(), stopped: v.number() }),
  handler: async () => {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const egressClient = new EgressClient(url, apiKey, apiSecret);

    // List ALL egresses across the entire project
    const egresses = await egressClient.listEgress();

    // Filter for stuck/active sessions
    const stuckSessions = egresses.filter(
      (e) =>
        e.status === EgressStatus.EGRESS_STARTING ||
        e.status === EgressStatus.EGRESS_ACTIVE,
    );

    if (stuckSessions.length === 0) {
      return { message: "No stuck sessions found. You are clear!", stopped: 0 };
    }

    // Forcefully stop all of them
    await Promise.allSettled(
      stuckSessions.map((e) => egressClient.stopEgress(e.egressId)),
    );

    return {
      message: `Attempted to stop ${stuckSessions.length} stuck sessions.`,
      stopped: stuckSessions.length,
    };
  },
});
