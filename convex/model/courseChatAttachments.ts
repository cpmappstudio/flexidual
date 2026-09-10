import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_MESSAGE_BYTES,
} from "../../lib/chat-attachments";

export const attachmentSummary = v.object({
  id: v.id("courseChatAttachments"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
});

export async function getSendAttachments(
  ctx: MutationCtx,
  ids: Id<"courseChatAttachments">[],
  classId: Id<"classes">,
  userId: Id<"users">,
) {
  if (ids.length > MAX_CHAT_ATTACHMENTS || new Set(ids).size !== ids.length)
    throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
  const files = await Promise.all(
    ids.map((id) => ctx.db.get("courseChatAttachments", id)),
  );
  const valid: Doc<"courseChatAttachments">[] = [];
  for (const file of files) {
    if (
      !file ||
      file.classId !== classId ||
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

export async function deleteChatAttachment(
  ctx: MutationCtx,
  file: Doc<"courseChatAttachments">,
) {
  if (file.storageId) await ctx.storage.delete(file.storageId);
  await ctx.db.delete("courseChatAttachments", file._id);
}

export async function deleteChatMessage(
  ctx: MutationCtx,
  message: Doc<"courseChatMessages">,
) {
  for (const id of message.attachmentIds ?? []) {
    const file = await ctx.db.get("courseChatAttachments", id);
    if (file?.messageId === message._id) await deleteChatAttachment(ctx, file);
  }
  await ctx.db.delete("courseChatMessages", message._id);
}
