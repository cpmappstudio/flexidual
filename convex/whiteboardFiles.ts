import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { canManageRoom } from "./permissions";
import { getCurrentUserOrThrow } from "./users";

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
 * Returns a short-lived Convex Storage upload URL.
 * The client POSTs the image blob directly to this URL and gets back { storageId }.
 */
export const generateUploadUrl = mutation({
  args: { roomName: v.string() },
  returns: v.string(),
  handler: async (ctx, { roomName }) => {
    await requireRoomManager(ctx, roomName);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Deletes all Convex storage files uploaded for a whiteboard session.
 * Called by the companion device when the teacher leaves.
 * Uses allSettled so already-deleted files don't cause failures.
 */
export const deleteSessionFiles = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, { roomName }) => {
    await requireRoomManager(ctx, roomName);
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const storageIds = Object.values(session?.fileRefs ?? {}).map(
      (ref) => ref.storageId,
    );
    await Promise.allSettled(storageIds.map((id) => ctx.storage.delete(id)));
    return null;
  },
});
