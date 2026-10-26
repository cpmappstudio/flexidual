import { isCourseTeacher } from "./model/courseAssignments";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { canAccessClass, canModerateCourseChat } from "./permissions";
import { getCurrentUserOrThrow } from "./users";
import { getUserImageUrl } from "./model/userImage";
import { isStudentEnrolled } from "./model/enrollments";
import {
  assertChatActive,
  getChatMute,
  isChatMutedForUser,
  canAttachToCourseChat,
  canManageCourseChatContent,
  getActiveLiveChatSchedule,
  getCourseChatAccess,
} from "./model/courseChatAccess";
import {
  attachmentSummary,
  getSendAttachments,
  deleteChatMessage,
  deleteChatAttachment,
} from "./model/courseChatAttachments";
import { containsChatLink } from "../lib/chat-attachments";
import {
  canSubmitCourseTask,
  getCourseTaskAccess,
} from "./model/courseTaskAccess";
import { chatReferenceParts } from "../lib/chat-references";
import { getClassTimeZone } from "./model/timeZone";
import { isValidTimeZone } from "../lib/time-zone";
import {
  chatTarget,
  chatTargetFields,
  type ChatTarget,
} from "./model/chatTarget";
import {
  chatCapabilities,
  chatPermission,
  chatMessages,
  getChatSource,
  patchChat,
  pinnedChatMessages,
  requireActiveChat,
  requireChatWriter,
  sourceTarget,
  type ChatSource,
} from "./model/chatSource";
import { getBroadcastRole, getBroadcastWriter } from "./model/broadcastAccess";

const MAX_MESSAGE_LENGTH = 2_000;
const DELETE_BATCH_SIZE = 100;

const messageValidator = v.object({
  _id: v.id("courseChatMessages"),
  _creationTime: v.number(),
  ...chatTargetFields,
  scheduleId: v.optional(v.id("classSchedule")),
  authorId: v.optional(v.id("users")),
  body: v.string(),
  pinnedAt: v.optional(v.number()),
  linksEnabled: v.optional(v.boolean()),
  availableTaskIds: v.optional(v.array(v.id("courseTasks"))),
  attachmentIds: v.optional(v.array(v.id("courseChatAttachments"))),
  attachments: v.optional(v.array(attachmentSummary)),
  authorName: v.string(),
  authorImageUrl: v.optional(v.string()),
  authorRole: v.union(
    v.literal("teacher"),
    v.literal("tutor"),
    v.literal("member"),
    v.literal("system"),
  ),
  event: v.optional(
    v.object({
      kind: v.union(
        v.literal("course_task"),
        v.literal("course_task_reminder"),
      ),
      taskId: v.id("courseTasks"),
      title: v.string(),
      dueAt: v.optional(v.number()),
      timeZone: v.optional(v.string()),
      available: v.boolean(),
    }),
  ),
  isOwn: v.boolean(),
});

function getAuthorRole(
  classData: Doc<"classes">,
  authorId: Id<"users"> | undefined,
) {
  if (isCourseTeacher(classData, authorId)) return "teacher" as const;
  if (classData.tutorId === authorId) return "tutor" as const;
  return "member" as const;
}

async function deleteMessageBatch(
  ctx: MutationCtx,
  target: ChatTarget,
  throughCreationTime: number,
) {
  const messages = await chatMessages(ctx, target, {
    through: throughCreationTime,
  }).take(DELETE_BATCH_SIZE);

  await Promise.all(messages.map((message) => deleteChatMessage(ctx, message)));

  return messages.length === DELETE_BATCH_SIZE;
}

async function getChatClearThrough(ctx: MutationCtx, source: ChatSource) {
  const latest = await chatMessages(ctx, sourceTarget(source))
    .order("desc")
    .first();
  return Math.max(
    source.data.chatNotificationsClearedThrough ?? 0,
    latest?._creationTime ?? 0,
  );
}

export const list = query({
  args: {
    ...chatTargetFields,
    scheduleId: v.optional(v.id("classSchedule")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    if (args.broadcastId) {
      const source = await getChatSource(ctx, args);
      if (
        !source ||
        !(await chatPermission(ctx, source, currentUser._id, "read"))
      )
        throw new ConvexError("PERMISSION_DENIED");
      if (args.scheduleId) throw new ConvexError("INVALID_CHAT_TARGET");
      const result = await chatMessages(ctx, args, {
        after:
          source.data.chatArchivedAt !== undefined
            ? Number.MAX_SAFE_INTEGER
            : (source.data.chatNotificationsClearedThrough ?? 0),
      })
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        ...result,
        page: await hydrateMessages(ctx, result.page, null, currentUser),
      };
    }
    chatTarget(args);
    const classId = args.classId!;
    const classData = await ctx.db.get("classes", classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    const access = await getCourseChatAccess(
      ctx,
      classData,
      currentUser._id,
      args.scheduleId,
    );
    if (access.kind === "none" && args.scheduleId === undefined) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    const result =
      access.kind === "live_session"
        ? await ctx.db
            .query("courseChatMessages")
            .withIndex("by_classId_and_scheduleId", (q) =>
              q.eq("classId", classId).eq("scheduleId", access.scheduleId),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("courseChatMessages")
            .withIndex("by_class", (q) =>
              access.kind === "course" && classData.chatArchivedAt === undefined
                ? q.eq("classId", classId)
                : q.eq("classId", classId).lt("_creationTime", 0),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return {
      ...result,
      page: await hydrateMessages(
        ctx,
        result.page,
        classData,
        currentUser,
        access.kind === "course",
      ),
    };
  },
});

async function hydrateMessages(
  ctx: QueryCtx,
  messages: Doc<"courseChatMessages">[],
  classData: Doc<"classes"> | null,
  currentUser: Doc<"users">,
  includeCourseOnlyContent = true,
): Promise<Infer<typeof messageValidator>[]> {
  const authorIds = [
    ...new Set(
      messages.flatMap(({ authorId }) => (authorId ? [authorId] : [])),
    ),
  ];
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
  const availableTasks = new Map<string, Promise<Doc<"courseTasks"> | null>>();
  function getAvailableTask(id: string) {
    let result = availableTasks.get(id);
    if (!result) {
      result = (async () => {
        if (!includeCourseOnlyContent || !classData) return null;
        const taskId = ctx.db.normalizeId("courseTasks", id);
        const task = taskId ? await ctx.db.get("courseTasks", taskId) : null;
        if (!task || task.classId !== classData._id) return null;
        const access = await getCourseTaskAccess(ctx, task, currentUser._id);
        return access.kind === "none" ? null : task;
      })();
      availableTasks.set(id, result);
    }
    return result;
  }

  return Promise.all(
    messages.map(async (message) => {
      const author = message.authorId
        ? authors.get(message.authorId)
        : undefined;
      let event: Infer<typeof messageValidator>["event"];
      if (message.event) {
        const task = await getAvailableTask(message.event.taskId);
        const available = task !== null;
        const timeZone =
          available && classData
            ? await getClassTimeZone(ctx, classData)
            : undefined;
        event = {
          kind: message.event.kind,
          taskId: message.event.taskId,
          title: available && task ? task.title : message.event.title,
          available,
          ...(available &&
          (message.event.reminderDueAt ?? task?.dueAt) !== undefined
            ? {
                dueAt: message.event.reminderDueAt ?? task?.dueAt,
                ...(timeZone && isValidTimeZone(timeZone) ? { timeZone } : {}),
              }
            : {}),
        };
      }
      const referencedTaskIds = [
        ...new Set(
          chatReferenceParts(message.body).flatMap((part) =>
            part.taskId ? [part.taskId] : [],
          ),
        ),
      ];
      const availableTaskIds = (
        await Promise.all(
          referencedTaskIds.map(
            async (id) => (await getAvailableTask(id))?._id ?? null,
          ),
        )
      ).filter((id) => id !== null);
      const files = await Promise.all(
        (message.attachmentIds ?? []).map((id) =>
          ctx.db.get("courseChatAttachments", id),
        ),
      );
      const attachments = files
        .filter(
          (file): file is NonNullable<typeof file> =>
            file?.messageId === message._id,
        )
        .map((file) => ({
          id: file._id,
          name: file.name,
          contentType: file.contentType,
          size: file.size,
        }));
      const {
        attachmentIds,
        linksEnabled,
        event: storedEvent,
        eventKey,
        ...readableMessage
      } = message;
      void attachmentIds;
      void linksEnabled;
      void storedEvent;
      void eventKey;
      return {
        ...readableMessage,
        ...(includeCourseOnlyContent ? { attachmentIds, linksEnabled } : {}),
        ...(referencedTaskIds.length ? { availableTaskIds } : {}),
        event,
        attachments,
        authorName: message.event
          ? "Flexidual"
          : (author?.author.fullName ?? "Deleted user"),
        authorImageUrl: author?.imageUrl,
        authorRole: message.event
          ? ("system" as const)
          : classData
            ? getAuthorRole(classData, message.authorId)
            : ("member" as const),
        isOwn: message.authorId === currentUser._id,
      };
    }),
  );
}

export const get = query({
  args: { messageId: v.string() },
  returns: v.union(messageValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const id = ctx.db.normalizeId("courseChatMessages", args.messageId);
    const message = id ? await ctx.db.get("courseChatMessages", id) : null;
    if (!message) return null;
    const source = await getChatSource(ctx, message);
    if (
      !source ||
      source.data.chatArchivedAt !== undefined ||
      message._creationTime <=
        (source.data.chatNotificationsClearedThrough ?? 0) ||
      !(await chatPermission(ctx, source, user._id, "read"))
    )
      return null;
    return (
      await hydrateMessages(
        ctx,
        [message],
        source.kind === "course" ? source.data : null,
        user,
      )
    )[0];
  },
});

export const listPinned = query({
  args: { ...chatTargetFields, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const source = await getChatSource(ctx, args);
    if (
      !source ||
      !(await chatPermission(ctx, source, currentUser._id, "read"))
    )
      throw new ConvexError("PERMISSION_DENIED");
    const result = await pinnedChatMessages(ctx, source)
      .order("desc")
      .paginate(args.paginationOpts);
    const visible = result.page.filter(
      (message) =>
        message._creationTime >
        (source.data.chatNotificationsClearedThrough ?? 0),
    );
    return {
      ...result,
      page: await hydrateMessages(
        ctx,
        visible,
        source.kind === "course" ? source.data : null,
        currentUser,
      ),
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
    const source = await getChatSource(ctx, message);
    if (!source || !(await chatPermission(ctx, source, user._id, "pin")))
      throw new ConvexError("PERMISSION_DENIED");
    requireActiveChat(source);
    if (
      message._creationTime <=
      (source.data.chatNotificationsClearedThrough ?? 0)
    )
      throw new ConvexError("MESSAGE_NOT_FOUND");
    if ((message.pinnedAt !== undefined) === args.pinned) return null;
    const pinnedAt = args.pinned
      ? Math.max(Date.now(), (source.data.chatLastPinnedAt ?? 0) + 1)
      : undefined;
    if (pinnedAt !== undefined)
      await patchChat(ctx, source, { chatLastPinnedAt: pinnedAt });
    await ctx.db.patch("courseChatMessages", message._id, { pinnedAt });
    return null;
  },
});

export const hasUnreadPins = query({
  args: chatTargetFields,
  returns: v.boolean(),
  handler: async (ctx, target) => {
    const user = await getCurrentUserOrThrow(ctx);
    const source = await getChatSource(ctx, target);
    if (!source || !(await chatPermission(ctx, source, user._id, "read")))
      return false;
    if (source.data.chatArchivedAt !== undefined) return false;
    const latest = await pinnedChatMessages(ctx, source).order("desc").first();
    if (
      !latest ||
      latest._creationTime <= (source.data.chatNotificationsClearedThrough ?? 0)
    )
      return false;
    const receipt = await getPinRead(ctx, target, user._id);
    return latest.pinnedAt! > (receipt?.seenThrough ?? 0);
  },
});

function getPinRead(
  ctx: QueryCtx | MutationCtx,
  target: ChatTarget,
  userId: Id<"users">,
) {
  return target.broadcastId
    ? ctx.db
        .query("courseChatPinReads")
        .withIndex("by_broadcastId_and_userId", (q) =>
          q.eq("broadcastId", target.broadcastId).eq("userId", userId),
        )
        .unique()
    : ctx.db
        .query("courseChatPinReads")
        .withIndex("by_classId_and_userId", (q) =>
          q.eq("classId", target.classId).eq("userId", userId),
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
    const source = await getChatSource(ctx, message);
    if (!source || !(await chatPermission(ctx, source, user._id, "read")))
      throw new ConvexError("PERMISSION_DENIED");
    if (
      source.data.chatArchivedAt !== undefined ||
      message._creationTime <=
        (source.data.chatNotificationsClearedThrough ?? 0)
    )
      return null;
    const receipt = await getPinRead(ctx, message, user._id);
    if ((receipt?.seenThrough ?? 0) >= args.pinnedAt) return null;
    if (receipt)
      await ctx.db.patch("courseChatPinReads", receipt._id, {
        seenThrough: args.pinnedAt,
      });
    else
      await ctx.db.insert("courseChatPinReads", {
        ...sourceTarget(source),
        userId: user._id,
        seenThrough: args.pinnedAt,
      });
    return null;
  },
});

export const listReferenceTasks = query({
  args: {
    classId: v.id("classes"),
    now: v.number(),
    search: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({ taskId: v.id("courseTasks"), title: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", args.classId);
    if (!course || !(await canAccessClass(ctx, user._id, course)))
      throw new ConvexError("PERMISSION_DENIED");
    assertChatActive(course);
    const result = await ctx.db
      .query("courseTasks")
      .withIndex("by_classId_and_isDraft_and_releasedAt", (q) =>
        q
          .eq("classId", course._id)
          .eq("isDraft", undefined)
          .gte("releasedAt", 0)
          .lte("releasedAt", args.now),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 20),
        maximumRowsRead: 128,
      });
    const search = args.search.trim().toLocaleLowerCase();
    const page = await Promise.all(
      result.page.map(async (task) => {
        if (
          !task.title.toLocaleLowerCase().includes(search) ||
          !(await canSubmitCourseTask(ctx, course, task, args.now))
        )
          return null;
        if ((await getCourseTaskAccess(ctx, task, user._id)).kind === "none")
          return null;
        return { taskId: task._id, title: task.title };
      }),
    );
    return { ...result, page: page.filter((task) => task !== null) };
  },
});

export const send = mutation({
  args: {
    ...chatTargetFields,
    scheduleId: v.optional(v.id("classSchedule")),
    body: v.string(),
    attachmentIds: v.optional(v.array(v.id("courseChatAttachments"))),
  },
  returns: v.id("courseChatMessages"),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const { source } = await requireChatWriter(
      ctx,
      args,
      currentUser._id,
      Boolean(args.attachmentIds?.length) || containsChatLink(args.body),
    );
    if (
      args.scheduleId &&
      (source.kind !== "course" ||
        !(await getActiveLiveChatSchedule(
          ctx,
          source.data._id,
          args.scheduleId,
        )))
    ) {
      throw new ConvexError("CHAT_SESSION_NOT_LIVE");
    }

    const body = args.body.trim();
    const attachmentIds = args.attachmentIds ?? [];
    if (!body && !attachmentIds.length)
      throw new ConvexError("MESSAGE_REQUIRED");
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError("MESSAGE_TOO_LONG");
    }
    const referencedTaskIds = new Set(
      chatReferenceParts(body).flatMap((part) =>
        part.taskId ? [part.taskId] : [],
      ),
    );
    for (const id of referencedTaskIds) {
      const taskId = ctx.db.normalizeId("courseTasks", id);
      const task = taskId && (await ctx.db.get("courseTasks", taskId));
      if (
        !task ||
        source.kind !== "course" ||
        task.classId !== source.data._id ||
        task.releasedAt === undefined ||
        task.releasedAt > Date.now() ||
        (await getCourseTaskAccess(ctx, task, currentUser._id)).kind === "none"
      )
        throw new ConvexError("INVALID_CHAT_REFERENCE");
    }
    const attachments = await getSendAttachments(
      ctx,
      attachmentIds,
      sourceTarget(source),
      currentUser._id,
    );
    const previousId = attachments.find((file) => file.messageId)?.messageId;
    if (previousId) {
      const previous = await ctx.db.get("courseChatMessages", previousId);
      if (
        previous?.body === body &&
        previous.scheduleId === args.scheduleId &&
        attachments.every((file) => file.messageId === previousId) &&
        previous.attachmentIds?.length === attachments.length
      )
        return previousId;
      throw new ConvexError("INVALID_CHAT_ATTACHMENTS");
    }

    const messageId = await ctx.db.insert("courseChatMessages", {
      ...sourceTarget(source),
      ...(args.scheduleId ? { scheduleId: args.scheduleId } : {}),
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
  args: {
    ...chatTargetFields,
    scheduleId: v.optional(v.id("classSchedule")),
  },
  returns: v.object({
    isMuted: v.boolean(),
    archived: v.boolean(),
    canAttach: v.boolean(),
    canPin: v.boolean(),
    readOnly: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    if (args.broadcastId) {
      const source = await getChatSource(ctx, args);
      if (!source || source.kind !== "broadcast" || args.scheduleId)
        throw new ConvexError("PERMISSION_DENIED");
      const caps = await chatCapabilities(ctx, source, currentUser._id);
      if (!caps.read) throw new ConvexError("PERMISSION_DENIED");
      const archived = source.data.chatArchivedAt !== undefined;
      return {
        isMuted: !caps.write || archived,
        archived,
        canAttach: caps.attach && !archived,
        canPin: caps.pin && !archived,
        readOnly: false,
      };
    }
    chatTarget(args);
    const classData = await ctx.db.get("classes", args.classId!);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    const access = await getCourseChatAccess(
      ctx,
      classData,
      currentUser._id,
      args.scheduleId,
    );
    if (access.kind === "none" && args.scheduleId === undefined) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (access.kind !== "course") {
      return {
        isMuted: true,
        archived: access.kind === "none",
        canAttach: false,
        canPin: false,
        readOnly: true,
      };
    }
    if (classData.chatArchivedAt !== undefined) {
      return {
        isMuted: true,
        archived: true,
        canAttach: false,
        canPin: false,
        readOnly: false,
      };
    }

    return {
      isMuted: await isChatMutedForUser(ctx, classData, currentUser._id),
      archived: false,
      canAttach: await canAttachToCourseChat(ctx, classData, currentUser._id),
      canPin: await canManageCourseChatContent(ctx, classData, currentUser._id),
      readOnly: false,
    };
  },
});

export const setSetting = mutation({
  args: {
    ...chatTargetFields,
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
    const source = await getChatSource(ctx, args);
    if (!source) throw new ConvexError("PERMISSION_DENIED");
    const isAllowed = await chatPermission(
      ctx,
      source,
      currentUser._id,
      args.setting === "disabled" ? "manage" : "moderate",
    );
    if (!isAllowed) throw new ConvexError("PERMISSION_DENIED");
    requireActiveChat(source);
    if (source.kind === "broadcast") {
      await ctx.db.patch(
        "broadcasts",
        source.data._id,
        args.setting === "disabled"
          ? { chatDisabled: args.enabled }
          : args.setting === "studentsMuted"
            ? { professorsMuted: args.enabled }
            : { professorAttachmentsEnabled: args.enabled },
      );
      return null;
    }
    const classData = source.data;

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
    ...chatTargetFields,
    userId: v.id("users"),
    muted: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    if (args.broadcastId) {
      const source = await getChatSource(ctx, args);
      if (
        !source ||
        source.kind !== "broadcast" ||
        !(await chatPermission(ctx, source, currentUser._id, "manage"))
      )
        throw new ConvexError("PERMISSION_DENIED");
      requireActiveChat(source);
      if ((await getBroadcastRole(ctx, args.userId, source.data)) !== "teacher")
        throw new ConvexError("INVALID_CHAT_PARTICIPANT");
      const writer = await getBroadcastWriter(
        ctx,
        source.data._id,
        args.userId,
      );
      if (writer)
        await ctx.db.patch("broadcastWriters", writer._id, {
          enabled: !args.muted,
        });
      else if (!args.muted)
        await ctx.db.insert("broadcastWriters", {
          broadcastId: source.data._id,
          userId: args.userId,
          enabled: true,
        });
      return null;
    }
    chatTarget(args);
    const classData = await ctx.db.get("classes", args.classId!);
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
  args: chatTargetFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const source = await getChatSource(ctx, args);
    if (
      !source ||
      !(await chatPermission(ctx, source, currentUser._id, "manage"))
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    requireActiveChat(source);
    const throughCreationTime = await getChatClearThrough(ctx, source);
    await patchChat(ctx, source, {
      chatNotificationsClearedThrough: throughCreationTime,
    });
    if (
      await deleteMessageBatch(ctx, sourceTarget(source), throughCreationTime)
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatMessages.continueClear,
        { ...sourceTarget(source), throughCreationTime },
      );
    }
    return null;
  },
});

export const setArchived = mutation({
  args: {
    ...chatTargetFields,
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserOrThrow(ctx);
    const source = await getChatSource(ctx, args);
    if (
      !source ||
      !(await chatPermission(ctx, source, currentUser._id, "manage"))
    )
      throw new ConvexError("PERMISSION_DENIED");
    const isArchived = source.data.chatArchivedAt !== undefined;
    if (isArchived === args.archived) return null;

    await patchChat(ctx, source, {
      chatArchivedAt: args.archived ? Date.now() : undefined,
      ...(args.archived
        ? {
            chatNotificationsClearedThrough: await getChatClearThrough(
              ctx,
              source,
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
      chatNotificationsClearedThrough: await getChatClearThrough(ctx, {
        kind: "course",
        data: classData,
      }),
    });
    return null;
  },
});

export const continueClear = internalMutation({
  args: {
    ...chatTargetFields,
    throughCreationTime: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await deleteMessageBatch(ctx, args, args.throughCreationTime)) {
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
