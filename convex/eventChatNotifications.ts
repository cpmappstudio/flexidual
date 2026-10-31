import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import {
  canAccessEvent,
  getEventAccessAssignmentId,
} from "./model/eventAccess";
import { pageEventAudienceAssignments } from "./model/eventChatAudience";
import {
  filterVisibleNotifications,
  notificationPaginationOptions,
} from "./model/systemNotifications";

const DELIVERY_BATCH_SIZE = 10;
const CLEANUP_BATCH_SIZE = 50;
const notificationKey = (eventId: Id<"events">, userId: Id<"users">) =>
  `event_chat:${eventId}:${userId}`;

export const publish = internalMutation({
  args: {
    messageId: v.id("eventChatMessages"),
    sourceIndex: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("eventChatMessages", args.messageId);
    if (!message) return null;
    const event = await ctx.db.get("events", message.eventId);
    if (
      !event ||
      event.chatArchivedAt !== undefined ||
      message._creationTime <= (event.chatNotificationsClearedThrough ?? 0)
    )
      return null;
    const page = await pageEventAudienceAssignments(
      ctx,
      event,
      { sourceIndex: args.sourceIndex, cursor: args.cursor },
      DELIVERY_BATCH_SIZE,
    );
    const [school, campus] = await Promise.all([
      ctx.db.get("schools", event.schoolId),
      event.campusId ? ctx.db.get("campuses", event.campusId) : null,
    ]);
    for (const assignment of page.rows) {
      const recipientId = assignment.userId;
      if (
        recipientId === message.authorId ||
        (await getEventAccessAssignmentId(
          ctx,
          recipientId,
          event,
          message._creationTime,
        )) !== assignment._id
      )
        continue;
      const dedupeKey = notificationKey(event._id, recipientId);
      const existing = await ctx.db
        .query("systemNotifications")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      if (
        message._creationTime <= (existing?.chatReadThrough ?? 0) ||
        existing?.eventChatMessageId === message._id
      )
        continue;
      const resetCount =
        !existing ||
        existing.readAt !== undefined ||
        existing.createdAt <= (event.chatNotificationsClearedThrough ?? 0);
      const fields = {
        recipientId,
        kind: "event_chat" as const,
        eventId: event._id,
        eventTitle: event.title,
        eventChatMessageId:
          (existing?.createdAt ?? 0) > message._creationTime
            ? existing?.eventChatMessageId
            : message._id,
        schoolId: event.schoolId,
        schoolName: school?.name,
        campusId: event.campusId,
        campusName: campus?.name,
        organizationSlug: campus?.slug ?? school?.slug,
        dedupeKey,
        chatMessageCount:
          (resetCount ? 0 : (existing.chatMessageCount ?? 0)) + 1,
        createdAt: Math.max(existing?.createdAt ?? 0, message._creationTime),
        readAt: undefined,
      };
      if (existing)
        await ctx.db.patch("systemNotifications", existing._id, fields);
      else await ctx.db.insert("systemNotifications", fields);
    }
    if (page.next)
      await ctx.scheduler.runAfter(0, internal.eventChatNotifications.publish, {
        messageId: args.messageId,
        sourceIndex: page.next.sourceIndex,
        cursor: page.next.cursor,
      });
    return null;
  },
});

export const markRead = mutation({
  args: { messageId: v.id("eventChatMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get("eventChatMessages", args.messageId);
    if (!message) return null;
    const event = await ctx.db.get("events", message.eventId);
    if (!event || !(await canAccessEvent(ctx, user._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    if (
      event.chatArchivedAt !== undefined ||
      message._creationTime <= (event.chatNotificationsClearedThrough ?? 0)
    )
      return null;
    const dedupeKey = notificationKey(event._id, user._id);
    const notification = await ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if ((notification?.chatReadThrough ?? 0) >= message._creationTime)
      return null;
    const readFields = {
      readAt: Date.now(),
      chatReadThrough: Math.max(
        message._creationTime,
        notification?.chatReadThrough ?? 0,
      ),
    };
    if (notification)
      await ctx.db.patch("systemNotifications", notification._id, {
        ...readFields,
        readAt:
          notification.createdAt > message._creationTime
            ? notification.readAt
            : readFields.readAt,
      });
    else {
      const [school, campus] = await Promise.all([
        ctx.db.get("schools", event.schoolId),
        event.campusId ? ctx.db.get("campuses", event.campusId) : null,
      ]);
      await ctx.db.insert("systemNotifications", {
        recipientId: user._id,
        kind: "event_chat",
        eventId: event._id,
        eventTitle: event.title,
        schoolId: event.schoolId,
        schoolName: school?.name,
        campusId: event.campusId,
        campusName: campus?.name,
        organizationSlug: campus?.slug ?? school?.slug,
        dedupeKey,
        createdAt: 0,
        chatMessageCount: 0,
        ...readFields,
      });
    }
    return null;
  },
});

export const listUnread = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      eventId: v.id("events"),
      count: v.number(),
      campusId: v.optional(v.id("campuses")),
      schoolId: v.optional(v.id("schools")),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const result = await ctx.db
      .query("systemNotifications")
      .withIndex("by_recipient_and_read_at_and_created_at", (q) =>
        q.eq("recipientId", user._id).eq("readAt", undefined),
      )
      .paginate(notificationPaginationOptions(args.paginationOpts));
    const visible = await filterVisibleNotifications(ctx, result.page);
    return {
      ...result,
      page: visible.flatMap((item) =>
        item.kind === "event_chat" && item.eventId
          ? [
              {
                eventId: item.eventId,
                count: item.chatMessageCount ?? 0,
                campusId: item.campusId,
                schoolId: item.schoolId,
              },
            ]
          : [],
      ),
    };
  },
});

export const removeByEvent = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prefix = `event_chat:${args.eventId}:`;
    const rows = await ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) =>
        q.gte("dedupeKey", prefix).lt("dedupeKey", `${prefix}\uffff`),
      )
      .take(CLEANUP_BATCH_SIZE);
    for (const row of rows)
      if (row.kind === "event_chat")
        await ctx.db.delete("systemNotifications", row._id);
    if (rows.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(
        0,
        internal.eventChatNotifications.removeByEvent,
        args,
      );
    return null;
  },
});
