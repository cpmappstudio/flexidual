import { MINUTE } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { isValidChatFile } from "../lib/chat-attachments";
import { canAccessEvent } from "./model/eventAccess";
import { requireEventChatAttachmentAccess } from "./model/eventChatAccess";
import { chatAttachmentLimiter } from "./model/chatAttachmentLimits";
import { deleteEventChatAttachment } from "./model/eventChatAttachments";

export const reserve = internalMutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id("eventChatAttachments"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await requireEventChatAttachmentAccess(ctx, args.eventId, user._id);
    if (!isValidChatFile({ ...args, type: args.contentType }))
      throw new ConvexError("INVALID_CHAT_FILE");
    await chatAttachmentLimiter.limit(ctx, "chatUploads", {
      key: user._id,
      throws: true,
    });
    await chatAttachmentLimiter.limit(ctx, "chatUploadBytes", {
      key: user._id,
      count: args.size,
      throws: true,
    });
    const expiresAt = Date.now() + 15 * MINUTE;
    const id = await ctx.db.insert("eventChatAttachments", {
      ...args,
      uploadedBy: user._id,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.eventChatAttachments.expire, {
      id,
    });
    return id;
  },
});

export const complete = internalMutation({
  args: { id: v.id("eventChatAttachments"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get("eventChatAttachments", args.id);
    if (!file || (!file.messageId && (file.expiresAt ?? 0) <= Date.now()))
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    const user = await getCurrentUserOrThrow(ctx);
    await requireEventChatAttachmentAccess(ctx, file.eventId, user._id);
    if (file.uploadedBy !== user._id)
      throw new ConvexError("PERMISSION_DENIED");
    if (file.storageId === args.storageId) return null;
    if (file.storageId || file.messageId)
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (
      !metadata ||
      metadata.size !== file.size ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== file.contentType)
    )
      throw new ConvexError("INVALID_CHAT_FILE");
    await ctx.db.patch("eventChatAttachments", file._id, {
      storageId: args.storageId,
    });
    return null;
  },
});

export const expire = internalMutation({
  args: { id: v.id("eventChatAttachments") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const file = await ctx.db.get("eventChatAttachments", id);
    if (file && !file.messageId && (file.expiresAt ?? 0) <= Date.now())
      await deleteEventChatAttachment(ctx, file);
    return null;
  },
});

export const read = internalMutation({
  args: { id: v.id("eventChatAttachments") },
  returns: v.object({
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  }),
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const file = await ctx.db.get("eventChatAttachments", id);
    if (!file?.storageId || !file.messageId)
      throw new ConvexError("PERMISSION_DENIED");
    const [event, message] = await Promise.all([
      ctx.db.get("events", file.eventId),
      ctx.db.get("eventChatMessages", file.messageId),
    ]);
    if (
      !event ||
      event.chatArchivedAt !== undefined ||
      !message ||
      message.eventId !== event._id ||
      !message.attachmentIds?.includes(id) ||
      message._creationTime <= (event.chatNotificationsClearedThrough ?? 0) ||
      !(await canAccessEvent(ctx, user._id, event))
    )
      throw new ConvexError("PERMISSION_DENIED");
    await chatAttachmentLimiter.limit(ctx, "chatDownloadBytes", {
      key: user._id,
      count: file.size,
      throws: true,
    });
    return {
      storageId: file.storageId,
      name: file.name,
      contentType: file.contentType,
      size: file.size,
    };
  },
});
