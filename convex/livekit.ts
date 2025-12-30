"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { AccessToken } from "livekit-server-sdk";

// Roles for token permissions
type LiveKitRole = "student" | "teacher" | "tutor" | "admin" | "superadmin"; 

/**
 * Generates an access token for LiveKit. This is called by the client (frontend).
 * It uses the LIVEKIT_API_KEY/SECRET environment variables.
 * Role is fetched from the database (single source of truth).
 */
export const getToken = action({
  args: {
    roomName: v.string(), 
    participantName: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.runQuery(api.users.getCurrentUser, { clerkId: identity.subject });
    if (!user) throw new Error("User not found");

    const userRole: LiveKitRole = (user.role as LiveKitRole) || "student";
    
    const sessionStatus = await ctx.runQuery(api.schedule.getSessionStatus, { 
      sessionId: args.roomName 
    });

    if (!sessionStatus) {
      throw new Error("Session not found");
    }

    // Allow Teachers/Admins to join early to set up the room
    const canJoinEarly = ["teacher", "admin", "superadmin", "tutor"].includes(userRole);

    if (!sessionStatus.isActive && !canJoinEarly) {
      throw new Error("Class has not started yet. Please wait for your teacher.");
    }

    // Additional check: Even teachers can't join if session is cancelled
    if (sessionStatus.status === "cancelled") {
      throw new Error("This session has been cancelled");
    }

    // Additional check: Don't allow joining completed sessions
    if (sessionStatus.status === "completed" && !canJoinEarly) {
      throw new Error("This session has already ended");
    }
    
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured");
    }

    const roomAdmin = ["teacher", "tutor", "admin", "superadmin"].includes(userRole);

    const at = new AccessToken(apiKey, apiSecret, {
      identity: identity.subject,
      name: args.participantName,
      metadata: JSON.stringify({
        role: userRole,
        userId: identity.subject,
        fullName: user.fullName,
      })
    });

    at.addGrant({
      roomJoin: true,
      room: args.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin, 
    });
    
    return at.toJwt();
  },
});