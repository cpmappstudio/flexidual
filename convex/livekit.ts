"use node";

import { ConvexError, v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { randomUUID } from "node:crypto";
import { 
  AccessToken, 
  EgressClient, 
  EncodedFileOutput, 
  EncodedFileType, 
  S3Upload, 
  EgressStatus,
  RoomServiceClient,
  TrackSource,
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

function getLiveKitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  return url && apiKey && apiSecret
    ? { url, apiKey, apiSecret }
    : null;
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
  await Promise.allSettled(
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

export const getToken = action({
  args: {
    roomName: v.string(),
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

    if (sessionStatus.status === "cancelled") {
      throw new ConvexError("This session has been cancelled");
    }

    if (sessionStatus.status === "completed") {
      throw new ConvexError("This session has already ended");
    }

    if (sessionStatus.status === "active" && !sessionStatus.isActive) {
      throw new ConvexError("This session has expired");
    }

    if (!access.roomAdmin && !sessionStatus.isLive) {
      throw new ConvexError("Class is not live");
    }

    if (!sessionStatus.isActive && !access.canJoinEarly) {
      throw new ConvexError("Class has not started yet. Please wait for your teacher.");
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
        fullName: user.fullName,
        imageUrl: user.imageUrl ?? null,
        isCompanion: args.isCompanion || false
      })
    });

    at.addGrant({
      roomJoin: true,
      room: args.roomName,
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

export const toggleRecording = action({
  args: {
    roomName: v.string(),
    start: v.boolean(),
  },
  returns: v.object({ success: v.boolean(), message: v.string() }),
  handler: async (ctx, args) => {
    const access = await requireRoomAdministrator(ctx, args.roomName);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const egressClient = new EgressClient(url, apiKey, apiSecret);

    if (args.start) {
      if (
        !access.session.isLive ||
        access.session.status === "cancelled" ||
        access.session.status === "completed"
      ) {
        throw new ConvexError("Only a live class can be recorded");
      }

      // 1. THE GUARD: Check if there is already an active/starting session for this room
      const existingEgresses = await egressClient.listEgress({ roomName: args.roomName });
      const isAlreadyRunning = existingEgresses.some(
        (e) => e.status === EgressStatus.EGRESS_STARTING || e.status === EgressStatus.EGRESS_ACTIVE
      );

      if (isAlreadyRunning) {
        return { success: false, message: "A recording is already starting or active." };
      }

      // Proceed with starting the recording
      if (
        !process.env.S3_ACCESS_KEY ||
        !process.env.S3_SECRET_KEY ||
        !process.env.S3_REGION ||
        !process.env.S3_BUCKET
      ) {
        throw new Error("Recording storage credentials are not configured.");
      }

      const s3Upload = new S3Upload({
        accessKey: process.env.S3_ACCESS_KEY,
        secret: process.env.S3_SECRET_KEY,
        region: process.env.S3_REGION,
        bucket: process.env.S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT,
      });

      const fileOutput = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: `recordings/${access.session.scheduleId}/${Date.now()}-${randomUUID()}.mp4`,
        output: { case: "s3", value: s3Upload },
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL is not defined in environment variables.");

      const recordingToken = randomUUID();
      await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
        roomName: args.roomName,
        recordingToken,
      });
      let egressInfo;
      try {
        egressInfo = await egressClient.startRoomCompositeEgress(
          args.roomName,
          fileOutput,
          {
            customBaseUrl: `${baseUrl}/recording?whiteboardToken=${encodeURIComponent(recordingToken)}`,
          },
        );
        if (!egressInfo.egressId) {
          throw new Error("LiveKit did not return an egress identifier.");
        }
        await ctx.runMutation(internal.recordings.createRecording, {
          scheduleId: access.session.scheduleId,
          roomName: args.roomName,
          egressId: egressInfo.egressId,
          startedAt: Date.now(),
        });
      } catch (error) {
        if (egressInfo?.egressId) {
          await egressClient
            .stopEgress(egressInfo.egressId)
            .catch(() => undefined);
        }
        await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
          roomName: args.roomName,
          recordingToken: undefined,
        });
        throw error;
      }

      return { success: true, message: "Recording started" };
    } else {
      const egresses = await egressClient.listEgress({
        roomName: args.roomName,
      });

      const activeEgresses = egresses.filter(
        (e) => 
          e.status === EgressStatus.EGRESS_STARTING || 
          e.status === EgressStatus.EGRESS_ACTIVE
      );

      if (activeEgresses.length > 0) {
        // Stop all active egresses found for this room
        await Promise.all(
          activeEgresses.map((e) => egressClient.stopEgress(e.egressId))
        );
      }

      await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
        roomName: args.roomName,
        recordingToken: undefined,
      });
      return activeEgresses.length > 0
        ? { success: true, message: "Recording stopped" }
        : { success: false, message: "No active recording found" };
    }
  },
});

export const setParticipantScreenSharePermission = action({
  args: {
    roomName: v.string(),
    participantIdentity: v.string(),
    allow: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomAdministrator(ctx, args.roomName);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const roomClient = new RoomServiceClient(url, apiKey, apiSecret);
    await roomClient.updateParticipant(
      args.roomName,
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomAdministrator(ctx, args.roomName);

    const config = getLiveKitConfig();
    if (!config) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const egressClient = new EgressClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    );
    try {
      await stopActiveRoomEgresses(egressClient, args.roomName);
    } catch (error) {
      console.error("Failed to stop LiveKit egress while ending class:", error);
    }

    const roomClient = new RoomServiceClient(
      config.url,
      config.apiKey,
      config.apiSecret,
    );
    await deleteRoomIfPresent(roomClient, args.roomName);

    const endedAt = Date.now();
    await ctx.runMutation(internal.schedule.endLiveSession, {
      roomName: args.roomName,
      endedAt,
    });

    return null;
  },
});

export const cleanupStaleSessions = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const staleSessions = await ctx.runQuery(
      internal.schedule.listStaleLiveSessions,
      { now },
    );
    if (staleSessions.length === 0) return null;

    const config = getLiveKitConfig();
    if (!config) {
      console.warn(
        "[LiveKit Cleanup] Credentials are not configured; finalizing stale Convex sessions only.",
      );
    }
    const roomClient = config
      ? new RoomServiceClient(config.url, config.apiKey, config.apiSecret)
      : null;
    const egressClient = config
      ? new EgressClient(config.url, config.apiKey, config.apiSecret)
      : null;

    for (const session of staleSessions) {
      if (roomClient && egressClient) {
        try {
          const rooms = await roomClient.listRooms([session.roomName]);
          if (rooms.length > 0 && !session.hardStale) {
            const participants = await roomClient.listParticipants(
              session.roomName,
            );
            if (participants.length > 0) continue;
          }

          await stopActiveRoomEgresses(egressClient, session.roomName);
          await deleteRoomIfPresent(roomClient, session.roomName);
        } catch (error) {
          console.error(
            `[LiveKit Cleanup] Failed to clean room ${session.roomName}:`,
            error,
          );
          continue;
        }
      }

      await ctx.runMutation(internal.schedule.endLiveSession, {
        roomName: session.roomName,
        endedAt: session.scheduledEnd,
      });
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
      console.error("[LiveKit Webhook] Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET");
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

    if (!event.egressInfo) {
      return { ok: true as const };
    }

    const info = event.egressInfo;
    const egressId = info.egressId;

    // EgressStatus: 0=STARTING, 1=ACTIVE, 2=ENDING, 3=COMPLETE, 4=FAILED, 5=ABORTED, 6=LIMIT_REACHED
    const statusMap: Record<number, "starting" | "active" | "complete" | "failed" | "aborted"> = {
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

    if (status === "complete" && info.fileResults && info.fileResults.length > 0) {
      const fileResult = info.fileResults[0];
      fileKey = fileResult.filename ?? undefined;
      fileSize = fileResult.size ? Number(fileResult.size) : undefined;
      durationMs = fileResult.duration ? Number(fileResult.duration) / 1_000_000 : undefined;
      completedAt = Date.now();

      const r2BaseUrl = process.env.R2_PUBLIC_URL;
      if (r2BaseUrl && fileKey) {
        url = `${r2BaseUrl.replace(/\/$/,  "")}/${fileKey}`;
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
      });
    }
    if (
      info.roomName &&
      (status === "complete" || status === "failed" || status === "aborted")
    ) {
      await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
        roomName: info.roomName,
        recordingToken: undefined,
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
        e.status === EgressStatus.EGRESS_ACTIVE
    );

    if (stuckSessions.length === 0) {
      return { message: "No stuck sessions found. You are clear!", stopped: 0 };
    }

    // Forcefully stop all of them
    await Promise.allSettled(
      stuckSessions.map((e) => egressClient.stopEgress(e.egressId))
    );

    return { 
      message: `Attempted to stop ${stuckSessions.length} stuck sessions.`,
      stopped: stuckSessions.length,
    };
  },
});
