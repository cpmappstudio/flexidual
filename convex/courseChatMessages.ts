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

const MAX_MESSAGE_LENGTH = 2_000;
const DELETE_BATCH_SIZE = 100;

const messageValidator = v.object({
  _id: v.id("courseChatMessages"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  authorId: v.id("users"),
  body: v.string(),
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

function assertChatActive(classData: Doc<"classes">) {
  if (classData.chatArchivedAt !== undefined) {
    throw new ConvexError("CHAT_ARCHIVED");
  }
}

function getChatMute(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("courseChatMutes")
    .withIndex("by_class_and_user", (q) =>
      q.eq("classId", classId).eq("userId", userId),
    )
    .unique();
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

  await Promise.all(
    messages.map((message) => ctx.db.delete("courseChatMessages", message._id)),
  );

  return messages.length === DELETE_BATCH_SIZE;
}

async function isChatMutedForUser(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
  userId: Id<"users">,
) {
  if (await getChatMute(ctx, classData._id, userId)) return true;
  if (!classData.chatDisabled && !classData.chatStudentsMuted) return false;

  const { canDisable } = await getCourseChatCapabilities(
    ctx,
    userId,
    classData,
  );
  if (canDisable) return false;
  if (classData.chatDisabled) return true;

  return await isStudentEnrolled(ctx, classData, userId);
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
    const authorIds = [...new Set(result.page.map(({ authorId }) => authorId))];
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

    return {
      ...result,
      page: result.page.map((message) => {
        const author = authors.get(message.authorId);
        return {
          ...message,
          authorName: author?.author.fullName ?? "Deleted user",
          authorImageUrl: author?.imageUrl,
          authorRole: getAuthorRole(classData, message.authorId),
          isOwn: message.authorId === currentUser._id,
        };
      }),
    };
  },
});

export const send = mutation({
  args: {
    classId: v.id("classes"),
    body: v.string(),
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
    if (!body) throw new ConvexError("MESSAGE_REQUIRED");
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError("MESSAGE_TOO_LONG");
    }

    return await ctx.db.insert("courseChatMessages", {
      classId: classData._id,
      authorId: currentUser._id,
      body,
    });
  },
});

export const getMyStatus = query({
  args: { classId: v.id("classes") },
  returns: v.object({ isMuted: v.boolean(), archived: v.boolean() }),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get("classes", args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    if (!(await canAccessClass(ctx, currentUser._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (classData.chatArchivedAt !== undefined) {
      return { isMuted: true, archived: true };
    }

    return {
      isMuted: await isChatMutedForUser(ctx, classData, currentUser._id),
      archived: false,
    };
  },
});

export const setSetting = mutation({
  args: {
    classId: v.id("classes"),
    setting: v.union(v.literal("studentsMuted"), v.literal("disabled")),
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

    const throughCreationTime = Date.now();
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
    const [messages, mutes] = await Promise.all([
      ctx.db
        .query("courseChatMessages")
        .withIndex("by_class", (q) => q.eq("classId", args.classId))
        .take(DELETE_BATCH_SIZE),
      ctx.db
        .query("courseChatMutes")
        .withIndex("by_class_and_user", (q) => q.eq("classId", args.classId))
        .take(DELETE_BATCH_SIZE),
    ]);
    await Promise.all([
      ...messages.map((message) =>
        ctx.db.delete("courseChatMessages", message._id),
      ),
      ...mutes.map((mute) => ctx.db.delete("courseChatMutes", mute._id)),
    ]);
    if (
      messages.length === DELETE_BATCH_SIZE ||
      mutes.length === DELETE_BATCH_SIZE
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
