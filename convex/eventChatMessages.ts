import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { getUserImageUrl } from "./model/userImage";
import { canAccessEvent, isEventStudent } from "./model/eventAccess";
import {
  assertEventChatActive,
  canAttachToEventChat,
  getEventChatCapabilities,
  getEventChatMute,
  isEventChatMuted,
} from "./model/eventChatAccess";
import {
  deleteEventChatAttachment,
  deleteEventChatMessage,
  eventAttachmentSummary,
  getEventSendAttachments,
} from "./model/eventChatAttachments";
import {
  containsChatLink,
  MAX_CHAT_TEXT_LENGTH,
} from "../lib/chat-attachments";

const DELETE_BATCH_SIZE = 100;

const messageValidator = v.object({
  _id: v.id("eventChatMessages"),
  _creationTime: v.number(),
  eventId: v.id("events"),
  authorId: v.id("users"),
  body: v.string(),
  pinnedAt: v.optional(v.number()),
  linksEnabled: v.optional(v.boolean()),
  attachments: v.array(eventAttachmentSummary),
  authorName: v.string(),
  authorImageUrl: v.optional(v.string()),
  authorRole: v.union(v.literal("teacher"), v.literal("member")),
  isOwn: v.boolean(),
});

async function requireEventChat(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
) {
  const event = await ctx.db.get("events", eventId);
  if (!event || !(await canAccessEvent(ctx, userId, event)))
    throw new ConvexError("PERMISSION_DENIED");
  return event;
}

async function hydrateMessages(
  ctx: QueryCtx,
  messages: Doc<"eventChatMessages">[],
  event: Doc<"events">,
  viewerId: Id<"users">,
): Promise<Infer<typeof messageValidator>[]> {
  const authorIds = [...new Set(messages.map((message) => message.authorId))];
  const authors = new Map(
    await Promise.all(
      authorIds.map(async (authorId) => {
        const author = await ctx.db.get("users", authorId);
        return [
          authorId,
          author
            ? {
                name: author.fullName,
                imageUrl: await getUserImageUrl(ctx, author),
              }
            : null,
        ] as const;
      }),
    ),
  );
  return Promise.all(
    messages.map(async (message) => {
      const files = await Promise.all(
        (message.attachmentIds ?? []).map((id) =>
          ctx.db.get("eventChatAttachments", id),
        ),
      );
      const attachments = files
        .filter((file) => file?.messageId === message._id)
        .map((file) => ({
          id: file!._id,
          name: file!.name,
          contentType: file!.contentType,
          size: file!.size,
        }));
      return {
        _id: message._id,
        _creationTime: message._creationTime,
        eventId: event._id,
        authorId: message.authorId,
        body: message.body,
        pinnedAt: message.pinnedAt,
        linksEnabled: message.linksEnabled,
        attachments,
        authorName: authors.get(message.authorId)?.name ?? "Deleted user",
        authorImageUrl: authors.get(message.authorId)?.imageUrl,
        authorRole:
          message.authorId === event.responsibleId ||
          event.teacherIds.includes(message.authorId)
            ? ("teacher" as const)
            : ("member" as const),
        isOwn: message.authorId === viewerId,
      };
    }),
  );
}

async function latestMessageTime(ctx: MutationCtx, event: Doc<"events">) {
  const latest = await ctx.db
    .query("eventChatMessages")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .order("desc")
    .first();
  return Math.max(
    event.chatNotificationsClearedThrough ?? 0,
    latest?._creationTime ?? 0,
  );
}

async function deleteMessageBatch(
  ctx: MutationCtx,
  eventId: Id<"events">,
  throughCreationTime: number,
) {
  const messages = await ctx.db
    .query("eventChatMessages")
    .withIndex("by_eventId", (q) =>
      q.eq("eventId", eventId).lte("_creationTime", throughCreationTime),
    )
    .take(DELETE_BATCH_SIZE);
  for (const message of messages) await deleteEventChatMessage(ctx, message);
  return messages.length === DELETE_BATCH_SIZE;
}

export const list = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    const result = await ctx.db
      .query("eventChatMessages")
      .withIndex("by_eventId", (q) =>
        event.chatArchivedAt === undefined
          ? q
              .eq("eventId", event._id)
              .gt("_creationTime", event.chatClearedThrough ?? 0)
          : q.eq("eventId", event._id).lt("_creationTime", 0),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await hydrateMessages(ctx, result.page, event, user._id),
    };
  },
});

export const send = mutation({
  args: {
    eventId: v.id("events"),
    body: v.string(),
    attachmentIds: v.optional(v.array(v.id("eventChatAttachments"))),
  },
  returns: v.id("eventChatMessages"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    assertEventChatActive(event);
    if (await isEventChatMuted(ctx, event, user._id))
      throw new ConvexError("CHAT_MUTED");
    const body = args.body.trim();
    const attachmentIds = args.attachmentIds ?? [];
    if (!body && !attachmentIds.length)
      throw new ConvexError("MESSAGE_REQUIRED");
    if (body.length > MAX_CHAT_TEXT_LENGTH)
      throw new ConvexError("MESSAGE_TOO_LONG");
    if (
      (attachmentIds.length || containsChatLink(body)) &&
      !(await canAttachToEventChat(ctx, event, user._id))
    )
      throw new ConvexError("CHAT_ATTACHMENTS_DISABLED");
    const files = await getEventSendAttachments(
      ctx,
      attachmentIds,
      event._id,
      user._id,
    );
    const previousId = files.find((file) => file.messageId)?.messageId;
    if (previousId) {
      const previous = await ctx.db.get("eventChatMessages", previousId);
      if (
        previous?.body === body &&
        files.every((file) => file.messageId === previousId) &&
        previous.attachmentIds?.length === files.length
      )
        return previousId;
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    }
    const messageId = await ctx.db.insert("eventChatMessages", {
      eventId: event._id,
      authorId: user._id,
      body,
      ...(containsChatLink(body) ? { linksEnabled: true } : {}),
      ...(attachmentIds.length ? { attachmentIds } : {}),
    });
    for (const file of files)
      await ctx.db.patch("eventChatAttachments", file._id, {
        messageId,
        expiresAt: undefined,
      });
    await ctx.scheduler.runAfter(0, internal.eventChatNotifications.publish, {
      messageId,
      sourceIndex: 0,
      cursor: null,
    });
    await ctx.scheduler.runAfter(0, internal.eventChatMessages.touchThread, {
      eventId: event._id,
    });
    return messageId;
  },
});

export const touchThread = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("events", args.eventId);
    if (!event) return null;
    const latest = await ctx.db
      .query("eventChatMessages")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .order("desc")
      .first();
    if (!latest || latest._creationTime <= (event.chatClearedThrough ?? 0))
      return null;
    const thread = await ctx.db
      .query("eventChatThreads")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .unique();
    if (!thread)
      await ctx.db.insert("eventChatThreads", {
        eventId: event._id,
        schoolId: event.schoolId,
        campusId: event.campusId,
        lastMessageAt: latest._creationTime,
      });
    else if (thread.lastMessageAt < latest._creationTime)
      await ctx.db.patch("eventChatThreads", thread._id, {
        lastMessageAt: latest._creationTime,
      });
    return null;
  },
});

export const getMyStatus = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    isMuted: v.boolean(),
    archived: v.boolean(),
    canAttach: v.boolean(),
    canPin: v.boolean(),
    readOnly: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    if (event.chatArchivedAt !== undefined)
      return {
        isMuted: true,
        archived: true,
        canAttach: false,
        canPin: false,
        readOnly: false,
      };
    return {
      isMuted: await isEventChatMuted(ctx, event, user._id),
      archived: false,
      canAttach: await canAttachToEventChat(ctx, event, user._id),
      canPin: (await getEventChatCapabilities(ctx, event, user._id))
        .canModerate,
      readOnly: false,
    };
  },
});

export const setSetting = mutation({
  args: {
    eventId: v.id("events"),
    setting: v.union(
      v.literal("studentsMuted"),
      v.literal("disabled"),
      v.literal("studentAttachmentsEnabled"),
    ),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    const capabilities = await getEventChatCapabilities(ctx, event, user._id);
    if (
      !(args.setting === "disabled"
        ? capabilities.canDisable
        : capabilities.canModerate)
    )
      throw new ConvexError("PERMISSION_DENIED");
    assertEventChatActive(event);
    await ctx.db.patch("events", event._id, {
      ...(args.setting === "disabled"
        ? { chatDisabled: args.enabled }
        : args.setting === "studentsMuted"
          ? { chatStudentsMuted: args.enabled }
          : { chatStudentAttachmentsEnabled: args.enabled }),
    });
    return null;
  },
});

export const setMuted = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.id("users"),
    muted: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    if (!(await getEventChatCapabilities(ctx, event, user._id)).canModerate)
      throw new ConvexError("PERMISSION_DENIED");
    assertEventChatActive(event);
    if (!(await isEventStudent(ctx, args.userId, event)))
      throw new ConvexError("INVALID_CHAT_PARTICIPANT");
    const existing = await getEventChatMute(ctx, event._id, args.userId);
    if (args.muted && !existing)
      await ctx.db.insert("eventChatMutes", {
        eventId: event._id,
        userId: args.userId,
        mutedAt: Date.now(),
        mutedBy: user._id,
      });
    if (!args.muted && existing)
      await ctx.db.delete("eventChatMutes", existing._id);
    return null;
  },
});

export const listPinned = query({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    const result = await ctx.db
      .query("eventChatMessages")
      .withIndex("by_eventId_and_pinnedAt", (q) =>
        event.chatArchivedAt === undefined
          ? q.eq("eventId", event._id).gt("pinnedAt", 0)
          : q.eq("eventId", event._id).lt("pinnedAt", undefined),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await hydrateMessages(
        ctx,
        result.page.filter(
          (message) =>
            message._creationTime >
            (event.chatNotificationsClearedThrough ?? 0),
        ),
        event,
        user._id,
      ),
    };
  },
});

export const setPinned = mutation({
  args: { messageId: v.id("eventChatMessages"), pinned: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get("eventChatMessages", args.messageId);
    if (!message) throw new ConvexError("MESSAGE_NOT_FOUND");
    const event = await requireEventChat(ctx, message.eventId, user._id);
    if (!(await getEventChatCapabilities(ctx, event, user._id)).canModerate)
      throw new ConvexError("PERMISSION_DENIED");
    assertEventChatActive(event);
    if (message._creationTime <= (event.chatNotificationsClearedThrough ?? 0))
      throw new ConvexError("MESSAGE_NOT_FOUND");
    if ((message.pinnedAt !== undefined) === args.pinned) return null;
    const pinnedAt = args.pinned
      ? Math.max(Date.now(), (event.chatLastPinnedAt ?? 0) + 1)
      : undefined;
    if (pinnedAt !== undefined)
      await ctx.db.patch("events", event._id, { chatLastPinnedAt: pinnedAt });
    await ctx.db.patch("eventChatMessages", message._id, { pinnedAt });
    return null;
  },
});

export const hasUnreadPins = query({
  args: { eventId: v.id("events") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get("events", args.eventId);
    if (
      !event ||
      event.chatArchivedAt !== undefined ||
      !(await canAccessEvent(ctx, user._id, event))
    )
      return false;
    const latest = await ctx.db
      .query("eventChatMessages")
      .withIndex("by_eventId_and_pinnedAt", (q) =>
        q.eq("eventId", event._id).gt("pinnedAt", 0),
      )
      .order("desc")
      .first();
    if (
      !latest ||
      latest._creationTime <= (event.chatNotificationsClearedThrough ?? 0)
    )
      return false;
    const receipt = await ctx.db
      .query("eventChatPinReads")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", user._id),
      )
      .unique();
    return latest.pinnedAt! > (receipt?.seenThrough ?? 0);
  },
});

export const markPinsSeen = mutation({
  args: { messageId: v.id("eventChatMessages"), pinnedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get("eventChatMessages", args.messageId);
    if (
      !message ||
      message.pinnedAt === undefined ||
      message.pinnedAt !== args.pinnedAt
    )
      return null;
    const event = await requireEventChat(ctx, message.eventId, user._id);
    if (
      event.chatArchivedAt !== undefined ||
      message._creationTime <= (event.chatNotificationsClearedThrough ?? 0)
    )
      return null;
    const receipt = await ctx.db
      .query("eventChatPinReads")
      .withIndex("by_eventId_and_userId", (q) =>
        q.eq("eventId", event._id).eq("userId", user._id),
      )
      .unique();
    if ((receipt?.seenThrough ?? 0) >= args.pinnedAt) return null;
    if (receipt)
      await ctx.db.patch("eventChatPinReads", receipt._id, {
        seenThrough: args.pinnedAt,
      });
    else
      await ctx.db.insert("eventChatPinReads", {
        eventId: event._id,
        userId: user._id,
        seenThrough: args.pinnedAt,
      });
    return null;
  },
});

export const clear = mutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    if (!(await getEventChatCapabilities(ctx, event, user._id)).canDisable)
      throw new ConvexError("PERMISSION_DENIED");
    assertEventChatActive(event);
    const throughCreationTime = await latestMessageTime(ctx, event);
    await ctx.db.patch("events", event._id, {
      chatNotificationsClearedThrough: throughCreationTime,
      chatClearedThrough: throughCreationTime,
    });
    const thread = await ctx.db
      .query("eventChatThreads")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .unique();
    if (thread) await ctx.db.delete("eventChatThreads", thread._id);
    if (await deleteMessageBatch(ctx, event._id, throughCreationTime))
      await ctx.scheduler.runAfter(
        0,
        internal.eventChatMessages.continueClear,
        {
          eventId: event._id,
          throughCreationTime,
        },
      );
    return null;
  },
});

export const setArchived = mutation({
  args: { eventId: v.id("events"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const event = await requireEventChat(ctx, args.eventId, user._id);
    if (!(await getEventChatCapabilities(ctx, event, user._id)).canDisable)
      throw new ConvexError("PERMISSION_DENIED");
    if ((event.chatArchivedAt !== undefined) === args.archived) return null;
    await ctx.db.patch("events", event._id, {
      chatArchivedAt: args.archived ? Date.now() : undefined,
      ...(args.archived
        ? {
            chatNotificationsClearedThrough: await latestMessageTime(
              ctx,
              event,
            ),
          }
        : {}),
    });
    return null;
  },
});

export const continueClear = internalMutation({
  args: { eventId: v.id("events"), throughCreationTime: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await deleteMessageBatch(ctx, args.eventId, args.throughCreationTime))
      await ctx.scheduler.runAfter(
        0,
        internal.eventChatMessages.continueClear,
        args,
      );
    return null;
  },
});

export const removeByEvent = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [messages, attachments, mutes, pinReads, thread] = await Promise.all([
      ctx.db
        .query("eventChatMessages")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("eventChatAttachments")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("eventChatMutes")
        .withIndex("by_eventId_and_userId", (q) =>
          q.eq("eventId", args.eventId),
        )
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("eventChatPinReads")
        .withIndex("by_eventId_and_userId", (q) =>
          q.eq("eventId", args.eventId),
        )
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("eventChatThreads")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .unique(),
    ]);
    await Promise.all([
      ...messages.map((message) =>
        ctx.db.delete("eventChatMessages", message._id),
      ),
      ...attachments.map((file) => deleteEventChatAttachment(ctx, file)),
      ...mutes.map((mute) => ctx.db.delete("eventChatMutes", mute._id)),
      ...pinReads.map((receipt) =>
        ctx.db.delete("eventChatPinReads", receipt._id),
      ),
      ...(thread ? [ctx.db.delete("eventChatThreads", thread._id)] : []),
    ]);
    if (
      [messages, attachments, mutes, pinReads].some(
        (rows) => rows.length === DELETE_BATCH_SIZE,
      )
    )
      await ctx.scheduler.runAfter(
        0,
        internal.eventChatMessages.removeByEvent,
        args,
      );
    return null;
  },
});
