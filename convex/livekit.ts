"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { AccessToken } from "livekit-server-sdk";

// Define roles for token permissions
type LiveKitRole = "student" | "teacher" | "tutor"; 

/**
 * Generates an access token for LiveKit. This is called by the client (frontend).
 * It uses the LIVEKIT_API_KEY/SECRET environment variables.
 */
export const getToken = action({
  args: {
    roomName: v.string(), 
    participantName: v.string(), 
    userRole: v.string(), 
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit API Key or Secret not configured in environment.");
    }

    // Default permissions
    let canPublish = false;
    let canSubscribe = true;
    let canPublishData = true;
    
    // Role-based permissions
    if (args.userRole === "teacher" || args.userRole === "tutor") {
        canPublish = true;
    } else if (args.userRole === "student") {
        // Students can usually publish audio/video in a classroom, 
        // but you might restrict this later via room logic.
        // For now, let's allow it so they can be seen.
        canPublish = true; 
    }

    // Teachers/tutors can update room metadata and moderate (kick users, mute, etc)
    let roomAdmin = args.userRole === "teacher" || args.userRole === "admin";

    const at = new AccessToken(apiKey, apiSecret, {
      identity: args.participantName, 
      name: args.participantName,
      metadata: JSON.stringify({
          role: args.userRole,
          userId: (await ctx.auth.getUserIdentity())?.subject, 
      })
    });

    at.addGrant({
      roomJoin: true,
      room: args.roomName,
      canPublish,
      canSubscribe,
      canPublishData,
      roomAdmin, 
    });

    return at.toJwt();
  },
});