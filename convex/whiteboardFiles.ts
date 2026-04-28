import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Returns a short-lived Convex Storage upload URL.
 * The client POSTs the image blob directly to this URL and gets back { storageId }.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Returns the public serving URL for a stored whiteboard image.
 * Called by the sender after upload; the URL is broadcast to all participants.
 */
export const getServingUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

/**
 * Deletes all Convex storage files uploaded for a whiteboard session.
 * Called by the companion device when the teacher leaves.
 * Uses allSettled so already-deleted files don't cause failures.
 */
export const deleteSessionFiles = mutation({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    await Promise.allSettled(storageIds.map((id) => ctx.storage.delete(id)));
  },
});
