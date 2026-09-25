import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireLiveWhiteboardManager } from "./model/whiteboardAccess";

/**
 * Returns a short-lived Convex Storage upload URL.
 * The client POSTs the image blob directly to this URL and gets back { storageId }.
 */
export const generateUploadUrl = mutation({
  args: { roomName: v.string() },
  returns: v.string(),
  handler: async (ctx, { roomName }) => {
    await requireLiveWhiteboardManager(ctx, roomName);
    return await ctx.storage.generateUploadUrl();
  },
});
