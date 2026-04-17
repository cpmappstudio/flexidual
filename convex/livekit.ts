"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { 
  AccessToken, 
  EgressClient, 
  EncodedFileOutput, 
  EncodedFileType, 
  S3Upload, 
  EgressStatus 
} from "livekit-server-sdk";

export const getToken = action({
  args: {
    roomName: v.string(), 
    participantName: v.string(),
    role: v.optional(v.string()),
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

    const at = new AccessToken(apiKey, apiSecret, {
      identity: identity.subject,
      name: args.participantName,
      metadata: JSON.stringify({
        role: finalRole,
        userId: identity.subject,
        fullName: user.fullName,
        imageUrl: user.imageUrl ?? null,
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

      await egressClient.startRoomCompositeEgress(
        args.roomName,
        fileOutput,
        { layout: "speaker" } 
      );
      
      return { success: true, message: "Recording started" };
    } else {
      const egresses = await egressClient.listEgress({
        roomName: args.roomName,
      });

      const activeEgress = egresses.find(
        (e) => e.status === EgressStatus.EGRESS_STARTING || e.status === EgressStatus.EGRESS_ACTIVE
      );

      if (activeEgress && activeEgress.egressId) {
        await egressClient.stopEgress(activeEgress.egressId);
        return { success: true, message: "Recording stopped" };
      }

      return { success: false, message: "No active recording found" };
    }
  },
});