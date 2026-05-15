"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { 
  AccessToken, 
  EgressClient, 
  EncodedFileOutput, 
  EncodedFileType, 
  S3Upload, 
  EgressStatus,
  WebhookReceiver,
} from "livekit-server-sdk";

export const getToken = action({
  args: {
    roomName: v.string(), 
    participantName: v.string(),
    role: v.optional(v.string()),
    isCompanion: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.runQuery(api.users.getCurrentUser, { clerkId: identity.subject });
    if (!user) throw new Error("User not found");

    // Check backend authorization to join this specific room
    const access = await ctx.runQuery(internal.schedule.checkLiveKitAccess, { 
      userId: user._id, 
      roomName: args.roomName 
    });

    if (!access || !access.authorized) {
      throw new Error("You are not authorized to join this session.");
    }
    
    const sessionStatus = await ctx.runQuery(api.schedule.getSessionStatus, { 
      sessionId: args.roomName 
    });

    if (!sessionStatus) {
      throw new Error("Session not found");
    }

    if (!sessionStatus.isActive && !access.canJoinEarly) {
      throw new Error("Class has not started yet. Please wait for your teacher.");
    }

    if (sessionStatus.status === "cancelled") {
      throw new Error("This session has been cancelled");
    }

    if (sessionStatus.status === "completed" && !access.canJoinEarly) {
      throw new Error("This session has already ended");
    }
    
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured");
    }

    // Determine the final role (Prefer the tenant context passed from the frontend)
    const finalRole = args.role || access.computedRole || "student";

    const finalIdentity = args.isCompanion 
      ? `${identity.subject}-companion` 
      : identity.subject;

    const finalName = args.isCompanion 
      ? `${args.participantName} (Companion)` 
      : args.participantName;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: finalIdentity,
      name: finalName,
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
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: access.roomAdmin, 
    });
    
    return at.toJwt();
  },
});

export const toggleRecording = action({
  args: {
    roomName: v.string(),
    start: v.boolean(),
    filePrefix: v.string(),
  },
  handler: async (ctx, args) => {
    // You might want to add similar auth/role checks here as you have in getToken
    // to ensure only authorized users can trigger recordings.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials are not configured.");
    }

    const egressClient = new EgressClient(url, apiKey, apiSecret);

    if (args.start) {
      // 1. THE GUARD: Check if there is already an active/starting session for this room
      const existingEgresses = await egressClient.listEgress({ roomName: args.roomName });
      const isAlreadyRunning = existingEgresses.some(
        (e) => e.status === EgressStatus.EGRESS_STARTING || e.status === EgressStatus.EGRESS_ACTIVE
      );

      if (isAlreadyRunning) {
        return { success: false, message: "A recording is already starting or active." };
      }

      // Proceed with starting the recording
      const s3Upload = new S3Upload({
        accessKey: process.env.S3_ACCESS_KEY ?? "",
        secret: process.env.S3_SECRET_KEY ?? "",
        region: process.env.S3_REGION ?? "",
        bucket: process.env.S3_BUCKET ?? "",
        endpoint: process.env.S3_ENDPOINT, 
      });

      const fileOutput = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: `${args.filePrefix}.mp4`,
        output: { case: "s3", value: s3Upload },
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL is not defined in environment variables.");

      // Look up the schedule before starting — done here so we have scheduleId ready
      const schedule = await ctx.runQuery(api.schedule.getByRoomName, { roomName: args.roomName });

      // startRoomCompositeEgress returns EgressInfo which includes egressId directly
      const egressInfo = await egressClient.startRoomCompositeEgress(
        args.roomName,
        fileOutput,
        { customBaseUrl: `${baseUrl}/recording` }
      );

      // Persist the egress using the egressId from the return value (no second listEgress needed)
      if (schedule && egressInfo.egressId) {
        await ctx.runMutation(internal.recordings.createRecording, {
          scheduleId: schedule._id,
          roomName: args.roomName,
          egressId: egressInfo.egressId,
          startedAt: Date.now(),
        });
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
        return { success: true, message: "Recording stopped" };
      }

      return { success: false, message: "No active recording found" };
    }
  },
});

// ─── Room name extraction from file key ───────────────────────────────────────
//
// File keys follow the pattern set in active-classroom-ui.tsx:
//   {YYYYMMDD}_{className}_{lessonTitle}_{roomName}_{timestamp}.mp4
// optionally prefixed by a folder:
//   some-folder/{YYYYMMDD}_{className}_{lessonTitle}_{roomName}_{timestamp}.mp4
//
// The roomName is always the segment immediately before the final all-digit timestamp.
// For standard class rooms it matches /class-[a-z0-9]+-series-\d+/.
// We use a regex that captures everything between the third underscore and the last
// underscore-followed-by-digits suffix, which is more robust to class/lesson names
// containing underscores.
function extractRoomNameFromFileKey(fileKey: string): string | null {
  // Strip folder prefix if present
  const base = fileKey.includes("/") ? fileKey.split("/").pop()! : fileKey;
  // Remove .mp4 extension
  const name = base.replace(/\.mp4$/i, "");
  // Split on _; last segment is the numeric uniqueSuffix
  const parts = name.split("_");
  if (parts.length < 4) return null;
  // The uniqueSuffix is the last part and must be all digits
  if (!/^\d+$/.test(parts[parts.length - 1])) return null;
  // roomName is the part before the uniqueSuffix
  return parts[parts.length - 2];
}

/**
 * Scans LiveKit egress history (primary) and S3 file keys (fallback) to backfill
 * any recordings that were not captured in the recordings table — for example,
 * recordings made before this feature was deployed or when the webhook was not set up.
 *
 * Pass `fileKeys` as an array of S3 object keys (e.g. from an R2 bucket listing)
 * to also cover egresses that LiveKit no longer has history for.
 *
 * Returns a summary: { checked, created, skipped, noSchedule, errors }
 */
export const healRecordings = action({
  args: {
    fileKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const r2BaseUrl = process.env.R2_PUBLIC_URL;

    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured.");
    }

    const egressClient = new EgressClient(livekitUrl, apiKey, apiSecret);
    const EGRESS_COMPLETE = 3; // EgressStatus.EGRESS_COMPLETE numeric value

    let checked = 0, created = 0, skipped = 0, noSchedule = 0, errors = 0;

    // ── Pass 1: LiveKit egress history ────────────────────────────────────────
    let allEgresses: Awaited<ReturnType<typeof egressClient.listEgress>> = [];
    try {
      allEgresses = await egressClient.listEgress();
    } catch (err) {
      console.error("[healRecordings] Failed to list egresses:", err);
    }

    for (const egress of allEgresses) {
      if (Number(egress.status) !== EGRESS_COMPLETE) continue;
      if (!egress.fileResults?.length || !egress.egressId) continue;

      checked++;

      try {
        const existing = await ctx.runQuery(internal.recordings.getByEgressId, {
          egressId: egress.egressId,
        });
        if (existing) { skipped++; continue; }

        const roomName = egress.roomName ?? "";
        const schedule = await ctx.runQuery(api.schedule.getByRoomName, { roomName });
        if (!schedule) { noSchedule++; continue; }

        const fileResult = egress.fileResults[0];
        const fileKey = fileResult.filename ?? undefined;
        const fileUrl = (r2BaseUrl && fileKey)
          ? `${r2BaseUrl.replace(/\/$/, "")}/${fileKey}`
          : undefined;
        const durationMs = fileResult.duration ? Number(fileResult.duration) / 1_000_000 : undefined;
        const fileSize = fileResult.size ? Number(fileResult.size) : undefined;
        const startedAt = egress.startedAt ? Number(egress.startedAt) : Date.now();

        await ctx.runMutation(internal.recordings.createRecording, {
          scheduleId: schedule._id,
          roomName,
          egressId: egress.egressId,
          startedAt,
        });
        await ctx.runMutation(internal.recordings.updateFromWebhook, {
          egressId: egress.egressId,
          status: "complete",
          ...(fileKey !== undefined && { fileKey }),
          ...(fileUrl !== undefined && { url: fileUrl }),
          ...(durationMs !== undefined && { durationMs }),
          ...(fileSize !== undefined && { fileSize }),
          completedAt: Date.now(),
        });
        created++;
      } catch (err) {
        console.error(`[healRecordings] Error processing egress ${egress.egressId}:`, err);
        errors++;
      }
    }

    // ── Pass 2: S3 file key fallback (for files LiveKit no longer tracks) ─────
    for (const fileKey of args.fileKeys ?? []) {
      if (!fileKey.endsWith(".mp4")) continue;

      try {
        // Skip if already in recordings table by fileKey
        const existingByKey = await ctx.runQuery(internal.recordings.getByFileKey, { fileKey });
        if (existingByKey) { skipped++; continue; }

        checked++;

        const roomName = extractRoomNameFromFileKey(fileKey);
        if (!roomName) { noSchedule++; continue; }

        const schedule = await ctx.runQuery(api.schedule.getByRoomName, { roomName });
        if (!schedule) { noSchedule++; continue; }

        const fileUrl = r2BaseUrl ? `${r2BaseUrl.replace(/\/$/, "")}/${fileKey}` : undefined;

        // Use a synthetic egressId derived from the fileKey so it's idempotent
        const syntheticEgressId = `healed:${fileKey}`;
        const alreadyByEgress = await ctx.runQuery(internal.recordings.getByEgressId, {
          egressId: syntheticEgressId,
        });
        if (alreadyByEgress) { skipped++; continue; }

        await ctx.runMutation(internal.recordings.createRecording, {
          scheduleId: schedule._id,
          roomName,
          egressId: syntheticEgressId,
          startedAt: Date.now(),
        });
        await ctx.runMutation(internal.recordings.updateFromWebhook, {
          egressId: syntheticEgressId,
          status: "complete",
          fileKey,
          ...(fileUrl !== undefined && { url: fileUrl }),
          completedAt: Date.now(),
        });
        created++;
      } catch (err) {
        console.error(`[healRecordings] Error processing file key ${fileKey}:`, err);
        errors++;
      }
    }

    console.log(`[healRecordings] Done — checked:${checked} created:${created} skipped:${skipped} noSchedule:${noSchedule} errors:${errors}`);
    return { checked, created, skipped, noSchedule, errors };
  },
});

/**
 * Internal action that verifies a LiveKit egress webhook and processes it.
 * Must live in a "use node" file because WebhookReceiver uses node:crypto.
 * Called from the /livekit-egress-webhook HTTP route in http.ts.
 */
export const processEgressWebhook = internalAction({
  args: { body: v.string(), authorization: v.string() },
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

    return { ok: true as const };
  },
});

export const forceCleanupEgress = action({
  args: {},
  handler: async (ctx) => {
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
      return { message: "No stuck sessions found. You are clear!" };
    }

    // Forcefully stop all of them
    const results = await Promise.allSettled(
      stuckSessions.map((e) => egressClient.stopEgress(e.egressId))
    );

    return { 
      message: `Attempted to stop ${stuckSessions.length} stuck sessions.`,
      results 
    };
  },
});