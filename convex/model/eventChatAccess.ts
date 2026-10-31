import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  canAccessEvent,
  canCreateEvent,
  canManageEvent,
  isEventStudent,
  isEventTeacher,
} from "./eventAccess";

type DbCtx = QueryCtx | MutationCtx;

export async function getEventChatCapabilities(
  ctx: DbCtx,
  event: Doc<"events">,
  userId: Id<"users">,
) {
  const canDisable = await canCreateEvent(ctx, userId, event);
  return {
    canDisable,
    canModerate:
      canDisable ||
      (await canManageEvent(ctx, userId, event)) ||
      ((event.responsibleId === userId || event.teacherIds.includes(userId)) &&
        (await isEventTeacher(ctx, userId, event))),
  };
}

export function assertEventChatActive(event: Doc<"events">) {
  if (event.chatArchivedAt !== undefined)
    throw new ConvexError("CHAT_ARCHIVED");
}

export function getEventChatMute(
  ctx: DbCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("eventChatMutes")
    .withIndex("by_eventId_and_userId", (q) =>
      q.eq("eventId", eventId).eq("userId", userId),
    )
    .unique();
}

export async function isEventChatMuted(
  ctx: DbCtx,
  event: Doc<"events">,
  userId: Id<"users">,
) {
  if (await getEventChatMute(ctx, event._id, userId)) return true;
  const capabilities = await getEventChatCapabilities(ctx, event, userId);
  if (capabilities.canDisable) return false;
  if (event.chatDisabled) return true;
  return Boolean(
    event.chatStudentsMuted && (await isEventStudent(ctx, userId, event)),
  );
}

export async function canAttachToEventChat(
  ctx: DbCtx,
  event: Doc<"events">,
  userId: Id<"users">,
) {
  if ((await getEventChatCapabilities(ctx, event, userId)).canModerate)
    return true;
  return Boolean(
    event.chatStudentAttachmentsEnabled &&
      (await isEventStudent(ctx, userId, event)),
  );
}

export async function requireEventChatAttachmentAccess(
  ctx: DbCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  const event = await ctx.db.get("events", eventId);
  if (!event || !(await canAccessEvent(ctx, userId, event)))
    throw new ConvexError("PERMISSION_DENIED");
  assertEventChatActive(event);
  if (await isEventChatMuted(ctx, event, userId))
    throw new ConvexError("CHAT_MUTED");
  if (!(await canAttachToEventChat(ctx, event, userId)))
    throw new ConvexError("CHAT_ATTACHMENTS_DISABLED");
  return event;
}
