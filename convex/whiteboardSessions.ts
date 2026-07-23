import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { canManageRoom } from "./permissions";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { canAccessSchedule } from "./schedule";

const fileRefValidator = v.object({
  url: v.string(),
  mimeType: v.string(),
  storageId: v.id("_storage"),
  created: v.number(),
});

const MAX_WHITEBOARD_FILE_SIZE = 10 * 1024 * 1024;

async function requireRoomManager(
  ctx: Parameters<typeof getCurrentUserOrThrow>[0],
  roomName: string,
) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!(await canManageRoom(ctx, user._id, roomName))) {
    throw new ConvexError("You do not have permission to manage this whiteboard");
  }
}

/**
 * Upsert the full element list for a room's whiteboard session.
 * Called by the companion device (writer) on every debounced canvas change.
 */
export const upsertScene = mutation({
  args: {
    roomName: v.string(),
    elements: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { roomName, elements }) => {
    await requireRoomManager(ctx, roomName);
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
    storageId: v.id("_storage"),
    created: v.number(),
  },
  returns: fileRefValidator,
  handler: async (ctx, { roomName, fileId, storageId, created }) => {
    await requireRoomManager(ctx, roomName);
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
    if (
      !metadata.contentType?.startsWith("image/") ||
      metadata.size > MAX_WHITEBOARD_FILE_SIZE
    ) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("INVALID_WHITEBOARD_FILE");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
    }
    const fileRef = {
      url,
      mimeType: metadata.contentType,
      storageId,
      created,
    };
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const replacedStorageId = existing?.fileRefs?.[fileId]?.storageId;
    const fileRefs = { ...(existing?.fileRefs ?? {}), [fileId]: fileRef };
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { fileRefs, updatedAt: now });
    } else {
      await ctx.db.insert("whiteboardSessions", { roomName, elements: [], fileRefs, updatedAt: now });
    }
    if (replacedStorageId && replacedStorageId !== storageId) {
      await ctx.storage.delete(replacedStorageId).catch(() => undefined);
    }
    return fileRef;
  },
});

/**
 * Reactive query — returns the current scene for a room.
 * All participants (teacher view, students) subscribe to this; they re-render
 * automatically whenever the companion device writes a new snapshot.
 */
export const getScene = query({
  args: {
    roomName: v.string(),
    recordingToken: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("whiteboardSessions"),
      _creationTime: v.number(),
      roomName: v.string(),
      elements: v.array(v.any()),
      fileRefs: v.optional(v.record(v.string(), fileRefValidator)),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { roomName, recordingToken }) => {
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (!session) return null;

    const user = await getCurrentUserFromAuth(ctx);
    if (user) {
      const schedule = await ctx.db
        .query("classSchedule")
        .withIndex("by_room", (q) => q.eq("roomName", roomName))
        .first();
      if (!schedule || !(await canAccessSchedule(ctx, user._id, schedule))) {
        throw new ConvexError("PERMISSION_DENIED");
      }
    } else if (
      !recordingToken ||
      !session.recordingToken ||
      recordingToken !== session.recordingToken
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    return {
      _id: session._id,
      _creationTime: session._creationTime,
      roomName: session.roomName,
      elements: session.elements,
      fileRefs: session.fileRefs,
      updatedAt: session.updatedAt,
    };
  },
});

export const setRecordingToken = internalMutation({
  args: {
    roomName: v.string(),
    recordingToken: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { roomName, recordingToken }) => {
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { recordingToken });
    } else if (recordingToken) {
      await ctx.db.insert("whiteboardSessions", {
        roomName,
        elements: [],
        recordingToken,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Delete the session document for a room.
 * Called alongside deleteSessionFiles when a session ends.
 */
export const clearSession = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    await requireRoomManager(ctx, roomName);
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
