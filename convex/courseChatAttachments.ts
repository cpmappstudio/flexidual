import { ConvexError, v } from "convex/values";
import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { requireChatAttachmentAccess } from "./model/courseChatAccess";
import { deleteChatAttachment } from "./model/courseChatAttachments";
import { getCurrentUserOrThrow } from "./users";
import { canAccessClass } from "./permissions";
import { isValidChatFile } from "../lib/chat-attachments";

const limiter = new RateLimiter(components.rateLimiter, {
  chatUploads: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 6 },
  chatUploadBytes: {
    kind: "token bucket",
    rate: 100 * 1024 * 1024,
    period: HOUR,
    capacity: 100 * 1024 * 1024,
  },
  chatDownloadBytes: {
    kind: "token bucket",
    rate: 500 * 1024 * 1024,
    period: HOUR,
    capacity: 500 * 1024 * 1024,
  },
});

export const reserve = internalMutation({
  args: {
    classId: v.id("classes"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id("courseChatAttachments"),
  handler: async (ctx, args) => {
    const { user } = await requireChatAttachmentAccess(ctx, args.classId);
    if (!isValidChatFile({ ...args, type: args.contentType }))
      throw new ConvexError("INVALID_CHAT_FILE");
    await limiter.limit(ctx, "chatUploads", { key: user._id, throws: true });
    await limiter.limit(ctx, "chatUploadBytes", {
      key: user._id,
      count: args.size,
      throws: true,
    });
    const expiresAt = Date.now() + 15 * MINUTE;
    const id = await ctx.db.insert("courseChatAttachments", {
      ...args,
      uploadedBy: user._id,
      expiresAt,
    });
    await ctx.scheduler.runAt(
      expiresAt,
      internal.courseChatAttachments.expire,
      { id },
    );
    return id;
  },
});

export const complete = internalMutation({
  args: { id: v.id("courseChatAttachments"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get("courseChatAttachments", args.id);
    if (!file || (!file.messageId && (file.expiresAt ?? 0) <= Date.now()))
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    const { user } = await requireChatAttachmentAccess(ctx, file.classId);
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
    await ctx.db.patch("courseChatAttachments", file._id, {
      storageId: args.storageId,
    });
    return null;
  },
});

export const expire = internalMutation({
  args: { id: v.id("courseChatAttachments") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const file = await ctx.db.get("courseChatAttachments", id);
    if (file && !file.messageId && (file.expiresAt ?? 0) <= Date.now())
      await deleteChatAttachment(ctx, file);
    return null;
  },
});

export const read = internalMutation({
  args: { id: v.id("courseChatAttachments") },
  returns: v.object({
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  }),
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const file = await ctx.db.get("courseChatAttachments", id);
    if (!file?.storageId || !file.messageId)
      throw new ConvexError("PERMISSION_DENIED");
    const [course, message] = await Promise.all([
      ctx.db.get("classes", file.classId),
      ctx.db.get("courseChatMessages", file.messageId),
    ]);
    if (
      !course ||
      course.chatArchivedAt !== undefined ||
      !message ||
      !message.attachmentIds?.includes(id) ||
      message._creationTime <= (course.chatNotificationsClearedThrough ?? 0) ||
      !(await canAccessClass(ctx, user._id, course))
    )
      throw new ConvexError("PERMISSION_DENIED");
    await limiter.limit(ctx, "chatDownloadBytes", {
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
