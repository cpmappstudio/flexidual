import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ChatSource } from "./chatSource";

export function chatNotificationKey(source: ChatSource, userId: Id<"users">) {
  return `${source.kind === "course" ? "course_chat" : "broadcast_chat"}:${source.data._id}:${userId}`;
}

export async function deliverChatNotification(
  ctx: MutationCtx,
  source: ChatSource,
  message: Doc<"courseChatMessages">,
  recipientId: Id<"users">,
  context: {
    schoolId?: Id<"schools">;
    campusId?: Id<"campuses">;
    organizationSlug?: string;
    schoolName?: string;
    campusName?: string;
  },
) {
  if (recipientId === message.authorId) return;
  const recipient = await ctx.db.get("users", recipientId);
  if (!recipient?.isActive) return;
  const dedupeKey = chatNotificationKey(source, recipientId);
  const existing = await ctx.db
    .query("systemNotifications")
    .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
    .unique();
  if (message._creationTime <= (existing?.chatReadThrough ?? 0)) return;
  if (source.kind === "broadcast") {
    const delivered = await ctx.db
      .query("broadcastMessageDeliveries")
      .withIndex("by_messageId_and_userId", (q) =>
        q.eq("messageId", message._id).eq("userId", recipientId),
      )
      .unique();
    if (delivered) return;
    // This receipt and the unread count commit together, including on OCC retries.
    await ctx.db.insert("broadcastMessageDeliveries", {
      messageId: message._id,
      userId: recipientId,
    });
  }
  const resetCount =
    !existing ||
    existing.readAt !== undefined ||
    existing.createdAt <= (source.data.chatNotificationsClearedThrough ?? 0);
  const fields = {
    recipientId,
    kind:
      source.kind === "course"
        ? ("course_chat" as const)
        : ("broadcast_chat" as const),
    ...(source.kind === "course"
      ? { classId: source.data._id }
      : { broadcastId: source.data._id }),
    className: source.data.name,
    ...context,
    dedupeKey,
    chatMessageCount: (resetCount ? 0 : (existing.chatMessageCount ?? 0)) + 1,
    createdAt: Math.max(existing?.createdAt ?? 0, message._creationTime),
    readAt: undefined,
  };
  if (existing) await ctx.db.patch("systemNotifications", existing._id, fields);
  else await ctx.db.insert("systemNotifications", fields);
}
