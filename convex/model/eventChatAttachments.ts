import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_MESSAGE_BYTES,
} from "../../lib/chat-attachments";

export const eventAttachmentSummary = v.object({
  id: v.id("eventChatAttachments"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
});

export async function getEventSendAttachments(
  ctx: MutationCtx,
  ids: Id<"eventChatAttachments">[],
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  if (ids.length > MAX_CHAT_ATTACHMENTS || new Set(ids).size !== ids.length)
    throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
  const files = await Promise.all(
    ids.map((id) => ctx.db.get("eventChatAttachments", id)),
  );
  const valid: Doc<"eventChatAttachments">[] = [];
  for (const file of files) {
    if (
      !file ||
      file.eventId !== eventId ||
      file.uploadedBy !== userId ||
      !file.storageId ||
      (!file.messageId && (file.expiresAt ?? 0) <= Date.now())
    )
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    valid.push(file);
  }
  if (valid.reduce((sum, file) => sum + file.size, 0) > MAX_CHAT_MESSAGE_BYTES)
    throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
  return valid;
}

export async function deleteEventChatAttachment(
  ctx: MutationCtx,
  file: Doc<"eventChatAttachments">,
) {
  if (file.storageId) await ctx.storage.delete(file.storageId);
  await ctx.db.delete("eventChatAttachments", file._id);
}

export async function deleteEventChatMessage(
  ctx: MutationCtx,
  message: Doc<"eventChatMessages">,
) {
  for (const id of message.attachmentIds ?? []) {
    const file = await ctx.db.get("eventChatAttachments", id);
    if (file?.messageId === message._id)
      await deleteEventChatAttachment(ctx, file);
  }
  await ctx.db.delete("eventChatMessages", message._id);
}
