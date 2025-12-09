"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { AccessToken } from "livekit-server-sdk";
import { api } from "./_generated/api";

// Define roles for token permissions
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
    // 1. Verify Authentication
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // 2. Fetch REAL Role from Database
    const user = await ctx.runQuery(api.users.getCurrentUser, { 
      clerkId: identity.subject 
    });

    if (!user) {
      throw new Error("User not found in database");
    }

    // Type assertion with validation
    const userRole: LiveKitRole = (user.role as LiveKitRole) || "student";
    
    // DEBUG LOG: Check your Convex Dashboard Logs to see this!
    console.log(`🎟️ Generating Token | User: ${user.fullName} | Role: ${userRole} | ID: ${identity.subject}`);

    // 3. Get LiveKit credentials
    const apiKey: string | undefined = process.env.LIVEKIT_API_KEY;
    const apiSecret: string | undefined = process.env.LIVEKIT_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit API Key or Secret not configured in environment.");
    }

    // 4. Role-based permissions
    const canPublish: boolean = true; 
    const canSubscribe: boolean = true;
    const canPublishData: boolean = true;
    
    // Teachers/Tutors/Admins have admin rights in the room
    const roomAdmin: boolean = userRole === "teacher" || userRole === "tutor" || userRole === "admin" || userRole === "superadmin";

    // 5. Create Access Token
    const at: AccessToken = new AccessToken(apiKey, apiSecret, {
      identity: identity.subject, // Clerk ID (Unique)
      name: args.participantName, // Display Name
      metadata: JSON.stringify({
        role: userRole, // <--- THIS IS THE KEY PART
        userId: identity.subject,
        fullName: user.fullName, // Add full name for display
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
    
    // More detailed logging
    console.log(`✅ Token Generated Successfully`);
    console.log(`   - Identity: ${identity.subject}`);
    console.log(`   - Name: ${args.participantName}`);
    console.log(`   - Role: ${userRole}`);
    console.log(`   - Metadata: ${JSON.stringify({ role: userRole, userId: identity.subject, fullName: user.fullName })}`);
    
    return at.toJwt();
  },
});