import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canAccessClass,
  canModerateCourseChat,
  getCourseChatCapabilities,
} from "./permissions";
import { getCurrentUserOrThrow } from "./users";
import { getUserImageUrl } from "./model/userImage";
import { isStudentEnrolled } from "./model/enrollments";
import {
  assertChatActive,
  getChatMute,
  isChatMutedForUser,
  canAttachToCourseChat,
  canManageCourseChatContent,
} from "./model/courseChatAccess";
import {
  attachmentSummary,
  getSendAttachments,
  deleteChatMessage,
  deleteChatAttachment,
} from "./model/courseChatAttachments";
import { containsChatLink } from "../lib/chat-attachments";

const MAX_MESSAGE_LENGTH = 2_000;
const DELETE_BATCH_SIZE = 100;

const messageValidator = v.object({
  _id: v.id("courseChatMessages"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  authorId: v.id("users"),
  body: v.string(),
  pinnedAt: v.optional(v.number()),
  linksEnabled: v.optional(v.boolean()),
  attachmentIds: v.optional(v.array(v.id("courseChatAttachments"))),
  attachments: v.optional(v.array(attachmentSummary)),
  authorName: v.string(),
  authorImageUrl: v.optional(v.string()),
  authorRole: v.union(
    v.literal("teacher"),
    v.literal("tutor"),
    v.literal("member"),
  ),
  isOwn: v.boolean(),
});

function getAuthorRole(classData: Doc<"classes">, authorId: Id<"users">) {
  if (classData.teacherId === authorId) return "teacher" as const;
  if (classData.tutorId === authorId) return "tutor" as const;
  return "member" as const;
}

async function deleteMessageBatch(
  ctx: MutationCtx,
  classId: Id<"classes">,
  throughCreationTime: number,
) {
  const messages = await ctx.db
    .query("courseChatMessages")
    .withIndex("by_class", (q) =>
      q.eq("classId", classId).lte("_creationTime", throughCreationTime),
    )
    .take(DELETE_BATCH_SIZE);

  await Promise.all(messages.map((message) => deleteChatMessage(ctx, message)));

  return messages.length === DELETE_BATCH_SIZE;
}

async function getChatClearThrough(ctx: MutationCtx, course: Doc<"classes">) {
  const latest = await ctx.db
    .query("courseChatMessages")
    .withIndex("by_class", (q) => q.eq("classId", course._id))
    .order("desc")
    .first();
  return Math.max(
    course.chatNotificationsClearedThrough ?? 0,
    latest?._creationTime ?? 0,
  );
}

export const list = query({
  args: {
    classId: v.id("classes"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    if (!(await canAccessClass(ctx, currentUser._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    const result = await ctx.db
      .query("courseChatMessages")
      .withIndex("by_class", (q) =>
        classData.chatArchivedAt === undefined
          ? q.eq("classId", args.classId)
          : q.eq("classId", args.classId).lt("_creationTime", 0),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await hydrateMessages(ctx, result.page, classData, currentUser),
    };
  },
});

async function hydrateMessages(
  ctx: QueryCtx,
  messages: Doc<"courseChatMessages">[],
  classData: Doc<"classes">,
  currentUser: Doc<"users">,
) {
  const authorIds = [...new Set(messages.map(({ authorId }) => authorId))];
  const authors = new Map(
    (
      await Promise.all(
        authorIds.map(async (authorId) => {
          const author = await ctx.db.get("users", authorId);
          if (!author) return null;
          return {
            author,
            imageUrl: await getUserImageUrl(ctx, author),
          };
        }),
      )
    )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .map((entry) => [entry.author._id, entry]),
  );

  return Promise.all(
    messages.map(async (message) => {
      const author = authors.get(message.authorId);
      const files = await Promise.all(
        (message.attachmentIds ?? []).map((id) =>
          ctx.db.get("courseChatAttachments", id),
        ),
      );
      return {
        ...message,
        attachments: files
          .filter(
            (file): file is NonNullable<typeof file> =>
              file?.messageId === message._id,
          )
          .map((file) => ({
            id: file._id,
            name: file.name,
            contentType: file.contentType,
            size: file.size,
          })),
        authorName: author?.author.fullName ?? "Deleted user",
        authorImageUrl: author?.imageUrl,
        authorRole: getAuthorRole(classData, message.authorId),
        isOwn: message.authorId === currentUser._id,
      };
    }),
  );
}

export const listPinned = query({
  args: { classId: v.id("classes"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", args.classId);
    if (!course || !(await canAccessClass(ctx, currentUser._id, course)))
      throw new ConvexError("PERMISSION_DENIED");
    const result = await ctx.db
      .query("courseChatMessages")
      .withIndex("by_classId_and_pinnedAt", (q) =>
        course.chatArchivedAt === undefined
          ? q.eq("classId", course._id).gt("pinnedAt", 0)
          : q.eq("classId", course._id).lt("pinnedAt", undefined),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const visible = result.page.filter(
      (message) =>
        message._creationTime > (course.chatNotificationsClearedThrough ?? 0),
    );
    return {
      ...result,
      page: await hydrateMessages(ctx, visible, course, currentUser),
    };
  },
});

export const setPinned = mutation({
  args: { messageId: v.id("courseChatMessages"), pinned: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get("courseChatMessages", args.messageId);
    if (!message) throw new ConvexError("MESSAGE_NOT_FOUND");
    const course = await ctx.db.get("classes", message.classId);
    if (!course || !(await canManageCourseChatContent(ctx, course, user._id)))
      throw new ConvexError("PERMISSION_DENIED");
    assertChatActive(course);
    if (message._creationTime <= (course.chatNotificationsClearedThrough ?? 0))
      throw new ConvexError("MESSAGE_NOT_FOUND");
    if ((message.pinnedAt !== undefined) === args.pinned) return null;
    const pinnedAt = args.pinned
      ? Math.max(Date.now(), (course.chatLastPinnedAt ?? 0) + 1)
      : undefined;
    if (pinnedAt !== undefined)
      await ctx.db.patch("classes", course._id, { chatLastPinnedAt: pinnedAt });
    await ctx.db.patch("courseChatMessages", message._id, { pinnedAt });
    return null;
  },
});

export const hasUnreadPins = query({
  args: { classId: v.id("classes") },
  returns: v.boolean(),
  handler: async (ctx, { classId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", classId);
    if (!course || !(await canAccessClass(ctx, user._id, course))) return false;
    if (course.chatArchivedAt !== undefined) return false;
    const latest = await ctx.db
      .query("courseChatMessages")
      .withIndex("by_classId_and_pinnedAt", (q) =>
        q.eq("classId", classId).gt("pinnedAt", 0),
      )
      .order("desc")
      .first();
    if (
      !latest ||
      latest._creationTime <= (course.chatNotificationsClearedThrough ?? 0)
    )
      return false;
    const receipt = await getPinRead(ctx, classId, user._id);
    return latest.pinnedAt! > (receipt?.seenThrough ?? 0);
  },
});

function getPinRead(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("courseChatPinReads")
    .withIndex("by_classId_and_userId", (q) =>
      q.eq("classId", classId).eq("userId", userId),
    )
    .unique();
}

export const markPinsSeen = mutation({
  args: { messageId: v.id("courseChatMessages"), pinnedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get("courseChatMessages", args.messageId);
    if (
      !message ||
      message.pinnedAt === undefined ||
      message.pinnedAt !== args.pinnedAt
    )
      return null;
    const course = await ctx.db.get("classes", message.classId);
    if (!course || !(await canAccessClass(ctx, user._id, course)))
      throw new ConvexError("PERMISSION_DENIED");
    if (
      course.chatArchivedAt !== undefined ||
      message._creationTime <= (course.chatNotificationsClearedThrough ?? 0)
    )
      return null;
    const receipt = await getPinRead(ctx, course._id, user._id);
    if ((receipt?.seenThrough ?? 0) >= args.pinnedAt) return null;
    if (receipt)
      await ctx.db.patch("courseChatPinReads", receipt._id, {
        seenThrough: args.pinnedAt,
      });
    else
      await ctx.db.insert("courseChatPinReads", {
        classId: course._id,
        userId: user._id,
        seenThrough: args.pinnedAt,
      });
    return null;
  },
});

export const send = mutation({
  args: {
    classId: v.id("classes"),
    body: v.string(),
    attachmentIds: v.optional(v.array(v.id("courseChatAttachments"))),
  },
  returns: v.id("courseChatMessages"),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    if (!(await canAccessClass(ctx, currentUser._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    assertChatActive(classData);
    if (await isChatMutedForUser(ctx, classData, currentUser._id)) {
      throw new ConvexError("CHAT_MUTED");
    }

    const body = args.body.trim();
    const attachmentIds = args.attachmentIds ?? [];
    if (!body && !attachmentIds.length)
      throw new ConvexError("MESSAGE_REQUIRED");
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError("MESSAGE_TOO_LONG");
    }
    if (
      (attachmentIds.length || containsChatLink(body)) &&
      !(await canAttachToCourseChat(ctx, classData, currentUser._id))
    )
      throw new ConvexError("CHAT_ATTACHMENTS_DISABLED");
    const attachments = await getSendAttachments(
      ctx,
      attachmentIds,
      classData._id,
      currentUser._id,
    );
    const previousId = attachments.find((file) => file.messageId)?.messageId;
    if (previousId) {
      const previous = await ctx.db.get("courseChatMessages", previousId);
      if (
        previous?.body === body &&
        attachments.every((file) => file.messageId === previousId) &&
        previous.attachmentIds?.length === attachments.length
      )
        return previousId;
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    }

    const messageId = await ctx.db.insert("courseChatMessages", {
      classId: classData._id,
      authorId: currentUser._id,
      body,
      ...(containsChatLink(body) ? { linksEnabled: true } : {}),
      ...(attachmentIds.length ? { attachmentIds } : {}),
    });
    for (const file of attachments)
      await ctx.db.patch("courseChatAttachments", file._id, {
        messageId,
        expiresAt: undefined,
      });
    await ctx.scheduler.runAfter(0, internal.courseChatNotifications.publish, {
      messageId,
      cursor: null,
      legacyOffset: 0,
    });
    return messageId;
  },
});

export const getMyStatus = query({
  args: { classId: v.id("classes") },
  returns: v.object({
    isMuted: v.boolean(),
    archived: v.boolean(),
    canAttach: v.boolean(),
    canPin: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    if (!(await canAccessClass(ctx, currentUser._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (classData.chatArchivedAt !== undefined) {
      return { isMuted: true, archived: true, canAttach: false, canPin: false };
    }

    return {
      isMuted: await isChatMutedForUser(ctx, classData, currentUser._id),
      archived: false,
      canAttach: await canAttachToCourseChat(ctx, classData, currentUser._id),
      canPin: await canManageCourseChatContent(ctx, classData, currentUser._id),
    };
  },
});

export const setSetting = mutation({
  args: {
    classId: v.id("classes"),
    setting: v.union(
      v.literal("studentsMuted"),
      v.literal("disabled"),
      v.literal("studentAttachmentsEnabled"),
    ),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const capabilities = await getCourseChatCapabilities(
      ctx,
      currentUser._id,
      classData,
    );
    const isAllowed =
      args.setting === "disabled"
        ? capabilities.canDisable
        : capabilities.canModerate;
    if (!isAllowed) throw new ConvexError("PERMISSION_DENIED");
    assertChatActive(classData);

    if (args.setting === "disabled") {
      await ctx.db.patch("classes", classData._id, {
        chatDisabled: args.enabled,
      });
    } else if (args.setting === "studentAttachmentsEnabled") {
      await ctx.db.patch("classes", classData._id, {
        chatStudentAttachmentsEnabled: args.enabled,
      });
    } else {
      await ctx.db.patch("classes", classData._id, {
        chatStudentsMuted: args.enabled,
      });
    }
    return null;
  },
});

export const setMuted = mutation({
  args: {
    classId: v.id("classes"),
    userId: v.id("users"),
    muted: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    if (!(await canModerateCourseChat(ctx, currentUser._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    assertChatActive(classData);
    if (!(await isStudentEnrolled(ctx, classData, args.userId))) {
      throw new ConvexError("INVALID_CHAT_PARTICIPANT");
    }

    const existing = await getChatMute(ctx, classData._id, args.userId);
    if (args.muted) {
      if (!existing) {
        await ctx.db.insert("courseChatMutes", {
          classId: classData._id,
          userId: args.userId,
          mutedAt: Date.now(),
          mutedBy: currentUser._id,
        });
      }
    } else if (existing) {
      await ctx.db.delete("courseChatMutes", existing._id);
    }

    return null;
  },
});

export const clear = mutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const capabilities = await getCourseChatCapabilities(
      ctx,
      currentUser._id,
      classData,
    );
    if (!capabilities.canDisable) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    assertChatActive(classData);

    const throughCreationTime = await getChatClearThrough(ctx, classData);
    await ctx.db.patch("classes", classData._id, {
      chatNotificationsClearedThrough: throughCreationTime,
    });
    if (await deleteMessageBatch(ctx, classData._id, throughCreationTime)) {
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatMessages.continueClear,
        { classId: classData._id, throughCreationTime },
      );
    }
    return null;
  },
});

export const setArchived = mutation({
  args: {
    classId: v.id("classes"),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const { canDisable } = await getCourseChatCapabilities(
      ctx,
      currentUser._id,
      classData,
    );
    if (!canDisable) throw new ConvexError("PERMISSION_DENIED");

    const isArchived = classData.chatArchivedAt !== undefined;
    if (isArchived === args.archived) return null;

    await ctx.db.patch("classes", classData._id, {
      chatArchivedAt: args.archived ? Date.now() : undefined,
      ...(args.archived
        ? {
            chatNotificationsClearedThrough: await getChatClearThrough(
              ctx,
              classData,
            ),
          }
        : {}),
    });
    return null;
  },
});

export const archiveAtCourseEnd = internalMutation({
  args: {
    classId: v.id("classes"),
    expectedEndDate: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const classData = await ctx.db.get("classes", args.classId);
    if (
      !classData ||
      classData.endDate !== args.expectedEndDate ||
      args.expectedEndDate >= Date.now() ||
      classData.chatArchivedAt !== undefined
    ) {
      return null;
    }

    await ctx.db.patch("classes", classData._id, {
      chatArchivedAt: Date.now(),
      chatNotificationsClearedThrough: await getChatClearThrough(
        ctx,
        classData,
      ),
    });
    return null;
  },
});

export const continueClear = internalMutation({
  args: {
    classId: v.id("classes"),
    throughCreationTime: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await deleteMessageBatch(ctx, args.classId, args.throughCreationTime)) {
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatMessages.continueClear,
        args,
      );
    }
    return null;
  },
});

export const removeByClass = internalMutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [messages, mutes, attachments, pinReads] = await Promise.all([
      ctx.db
        .query("courseChatMessages")
        .withIndex("by_class", (q) => q.eq("classId", args.classId))
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("courseChatMutes")
        .withIndex("by_class_and_user", (q) => q.eq("classId", args.classId))
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("courseChatAttachments")
        .withIndex("by_classId", (q) => q.eq("classId", args.classId))
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("courseChatPinReads")
        .withIndex("by_classId_and_userId", (q) =>
          q.eq("classId", args.classId),
        )
        .take(DELETE_BATCH_SIZE),
    ]);
    await Promise.all([
      ...messages.map((message) =>
        ctx.db.delete("courseChatMessages", message._id),
      ),
      ...mutes.map((mute) => ctx.db.delete("courseChatMutes", mute._id)),
      ...attachments.map((file) => deleteChatAttachment(ctx, file)),
      ...pinReads.map((receipt) =>
        ctx.db.delete("courseChatPinReads", receipt._id),
      ),
    ]);
    if (
      messages.length === DELETE_BATCH_SIZE ||
      attachments.length === DELETE_BATCH_SIZE ||
      mutes.length === DELETE_BATCH_SIZE ||
      pinReads.length === DELETE_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatMessages.removeByClass,
        args,
      );
    }
    return null;
  },
});
