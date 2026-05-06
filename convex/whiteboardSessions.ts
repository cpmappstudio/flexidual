import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Upsert the full element list for a room's whiteboard session.
 * Called by the companion device (writer) on every debounced canvas change.
 */
export const upsertScene = mutation({
  args: {
    roomName: v.string(),
    elements: v.any(),
  },
  handler: async (ctx, { roomName, elements }) => {
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { elements, updatedAt: now });
    } else {
      await ctx.db.insert("whiteboardSessions", { roomName, elements, updatedAt: now });
    }
  },
});

/**
 * Add or update a single image file ref after a successful Convex storage upload.
 * Readers will pick up the new ref via their reactive getScene subscription.
 */
export const addFileRef = mutation({
  args: {
    roomName: v.string(),
    fileId: v.string(),
    url: v.string(),
    mimeType: v.string(),
    storageId: v.string(),
    created: v.number(),
  },
  handler: async (ctx, { roomName, fileId, url, mimeType, storageId, created }) => {
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const fileRefs = { ...(existing?.fileRefs ?? {}), [fileId]: { url, mimeType, storageId, created } };
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { fileRefs, updatedAt: now });
    } else {
      await ctx.db.insert("whiteboardSessions", { roomName, elements: [], fileRefs, updatedAt: now });
    }
  },
});

/**
 * Reactive query — returns the current scene for a room.
 * All participants (teacher view, students) subscribe to this; they re-render
 * automatically whenever the companion device writes a new snapshot.
 */
export const getScene = query({
  args: { roomName: v.string() },
  handler: async (ctx, { roomName }) => {
    return await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
  },
});

/**
 * Delete the session document for a room.
 * Called alongside deleteSessionFiles when a session ends.
 */
export const clearSession = mutation({
  args: { roomName: v.string() },
  handler: async (ctx, { roomName }) => {
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
