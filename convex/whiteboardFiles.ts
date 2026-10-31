import { ConvexError, v } from "convex/values";
import { RateLimiter, HOUR, MINUTE } from "@convex-dev/rate-limiter";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { requireLiveWhiteboardManager } from "./model/whiteboardAccess";
import { getLiveRoomName } from "./model/liveActivation";
import { fileRefValidator } from "./whiteboardSessions";
import { findWhiteboardManifest } from "./model/whiteboardSceneStorage";
import { attachNotebookFile } from "./model/notebookFiles";

export const MAX_WHITEBOARD_FILE_SIZE = 10 * 1024 * 1024;
const imageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/jfif",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/bmp",
  "image/avif",
  "image/x-icon",
]);
const uploadArgs = {
  roomName: v.string(),
  expectedLiveRoomName: v.string(),
  fileId: v.string(),
  created: v.number(),
  contentType: v.string(),
  size: v.number(),
};
const limiter = new RateLimiter(components.rateLimiter, {
  whiteboardUploads: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  whiteboardUploadBytes: {
    kind: "token bucket",
    rate: 200 * 1024 * 1024,
    period: HOUR,
    capacity: 200 * 1024 * 1024,
  },
});

// Old clients must reload; arbitrary client-supplied storage IDs cannot prove ownership.
export const generateUploadUrl = mutation({
  args: { roomName: v.string() },
  returns: v.string(),
  handler: async (ctx, { roomName }) => {
    await requireLiveWhiteboardManager(ctx, roomName);
    throw new ConvexError("WHITEBOARD_UPLOAD_REQUIRES_AUTHENTICATED_BODY");
  },
});

export const authorizeUpload = internalMutation({
  args: uploadArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { schedule, user } = await requireLiveWhiteboardManager(
      ctx,
      args.roomName,
    );
    if (getLiveRoomName(schedule) !== args.expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    await validateAndLimitWhiteboardUpload(ctx, user._id, args);
    return null;
  },
});

// Only the authenticated HTTP action passes the ID it just stored, never the browser.
export const complete = internalMutation({
  args: { ...uploadArgs, storageId: v.id("_storage") },
  returns: fileRefValidator,
  handler: async (ctx, args) => {
    const { schedule } = await requireLiveWhiteboardManager(ctx, args.roomName);
    if (getLiveRoomName(schedule) !== args.expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (
      !metadata ||
      metadata.size !== args.size ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== args.contentType)
    )
      throw new ConvexError("INVALID_WHITEBOARD_FILE");
    const manifest = await findWhiteboardManifest(ctx, args.roomName);
    // An upload started before adoption still belongs to that session's page.
    if (manifest?.pageId)
      return attachNotebookFile(ctx, manifest.pageId, {
        fileId: args.fileId,
        storageId: args.storageId,
        mimeType: args.contentType,
        created: args.created,
      });
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", args.roomName))
      .unique();
    // Content-addressed Excalidraw IDs are immutable. Retries keep existing image refs.
    const existingRefs = session?.fileRefs ?? {};
    if (Object.hasOwn(existingRefs, args.fileId))
      return existingRefs[args.fileId];
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
    const ref = {
      url,
      storageId: args.storageId,
      mimeType: args.contentType,
      created: args.created,
    };
    const fileRefs = { ...existingRefs, [args.fileId]: ref };
    if (session) {
      await ctx.db.patch("whiteboardSessions", session._id, {
        fileRefs,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("whiteboardSessions", {
        roomName: args.roomName,
        elements: [],
        fileRefs,
        updatedAt: Date.now(),
      });
    }
    return ref;
  },
});

export async function validateAndLimitWhiteboardUpload(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: { fileId: string; created: number; size: number; contentType: string },
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(args.fileId) ||
    !Number.isFinite(args.created) ||
    !Number.isSafeInteger(args.size) ||
    args.size <= 0 ||
    args.size > MAX_WHITEBOARD_FILE_SIZE ||
    !imageTypes.has(args.contentType)
  )
    throw new ConvexError("INVALID_WHITEBOARD_FILE");
  await limiter.limit(ctx, "whiteboardUploads", {
    key: userId,
    throws: true,
  });
  await limiter.limit(ctx, "whiteboardUploadBytes", {
    key: userId,
    count: args.size,
    throws: true,
  });
}
