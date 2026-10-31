import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { getCourseTeacherIds } from "./model/courseAssignments";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  courseTaskEventValidator,
  deliverCourseTaskEvent,
  taskEventFromMessage,
  type CourseTaskEvent,
} from "./model/courseChatEvents";
import type { Doc } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./users";
import { getClassNotificationContext } from "./model/systemNotificationEvents";
import {
  filterVisibleNotifications,
  notificationPaginationOptions,
} from "./model/systemNotifications";
import {
  chatPermission,
  getChatSource,
  sourceTarget,
} from "./model/chatSource";
import {
  chatNotificationKey,
  deliverChatNotification,
} from "./model/chatNotification";
import { getBroadcastMemberships } from "./model/broadcastAccess";

const CLEANUP_BATCH_SIZE = 50;
// Smaller delivery transactions limit how many recipients a concurrent read retries.
const DELIVERY_BATCH_SIZE = 10;

async function scheduleBroadcastOrganization(
  ctx: MutationCtx,
  messageId: Id<"courseChatMessages">,
  broadcast: Doc<"broadcasts">,
  orgId: string,
  orgType: "campus" | "school",
) {
  for (const role of ["teacher", "principal", "admin"] as const)
    await ctx.scheduler.runAfter(
      0,
      internal.courseChatNotifications.publishBroadcastMembers,
      { messageId, orgId, orgType, role, cursor: null },
    );
  for (const gradeCode of [...broadcast.gradeCodes, undefined])
    await ctx.scheduler.runAfter(
      0,
      internal.courseChatNotifications.publishBroadcastMembers,
      { messageId, orgId, orgType, role: "student", gradeCode, cursor: null },
    );
}

async function publishTaskBatch(
  ctx: MutationCtx,
  event: CourseTaskEvent,
  course: Doc<"classes">,
  cursor: string | null,
) {
  const page = await ctx.db
    .query("courseTaskRecipients")
    .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", event.taskId))
    .paginate({
      cursor,
      numItems: DELIVERY_BATCH_SIZE,
      maximumRowsRead: DELIVERY_BATCH_SIZE,
    });
  for (const recipient of page.page) {
    if (recipient.assignedAt <= event.createdAt)
      await deliverCourseTaskEvent(ctx, event, course, recipient.studentId);
  }
  if (!page.isDone)
    await ctx.scheduler.runAfter(
      0,
      internal.courseChatNotifications.publishTask,
      { event, cursor: page.continueCursor },
    );
}

export const publishTask = internalMutation({
  args: {
    event: courseTaskEventValidator,
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("courseTasks", args.event.taskId);
    const course = task ? await ctx.db.get("classes", task.classId) : null;
    if (course) await publishTaskBatch(ctx, args.event, course, args.cursor);
    return null;
  },
});

// Delivery uses bounded batches without loading a chat's message history.
export const publish = internalMutation({
  args: {
    messageId: v.id("courseChatMessages"),
    cursor: v.union(v.string(), v.null()),
    legacyOffset: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("courseChatMessages", args.messageId);
    if (!message) return null;
    if (message.broadcastId) {
      const broadcast = await ctx.db.get("broadcasts", message.broadcastId);
      if (
        !broadcast ||
        broadcast.chatArchivedAt !== undefined ||
        message._creationTime <=
          (broadcast.chatNotificationsClearedThrough ?? 0)
      )
        return null;
      await scheduleBroadcastOrganization(
        ctx,
        message._id,
        broadcast,
        broadcast.mode === "private" ? broadcast.campusId! : broadcast.schoolId,
        broadcast.mode === "private" ? "campus" : "school",
      );
      if (broadcast.mode === "school")
        await ctx.scheduler.runAfter(
          0,
          internal.courseChatNotifications.publishBroadcastCampuses,
          { messageId: message._id, cursor: null },
        );
      return null;
    }
    if (!message.classId) return null;
    const course = await ctx.db.get("classes", message.classId);
    if (
      !course ||
      course.chatArchivedAt !== undefined ||
      message._creationTime <= (course.chatNotificationsClearedThrough ?? 0)
    )
      return null;

    if (message.event) {
      await publishTaskBatch(
        ctx,
        taskEventFromMessage(message),
        course,
        args.cursor,
      );
      return null;
    }

    const page = course.enrollmentsMigratedAt
      ? await ctx.db
          .query("classEnrollments")
          .withIndex("by_class", (q) => q.eq("classId", course._id))
          .paginate({
            cursor: args.cursor,
            numItems: DELIVERY_BATCH_SIZE,
            maximumRowsRead: DELIVERY_BATCH_SIZE,
          })
      : null;
    const legacyStudents = course.students ?? [];
    const students = page
      ? page.page
          .filter((entry) => entry.enrolledAt <= message._creationTime)
          .map((entry) => entry.studentId)
      : legacyStudents.slice(
          args.legacyOffset,
          args.legacyOffset + DELIVERY_BATCH_SIZE,
        );
    const staff = [...getCourseTeacherIds(course), course.tutorId].filter(
      (id): id is Id<"users"> => id !== undefined,
    );
    const firstBatch = args.cursor === null && args.legacyOffset === 0;
    const recipients = new Set([
      ...(firstBatch ? staff : []),
      ...students.filter((id) => !staff.includes(id)),
    ]);
    if (message.authorId) recipients.delete(message.authorId);
    const context = await getClassNotificationContext(ctx, course);
    for (const recipientId of recipients) {
      await deliverChatNotification(
        ctx,
        { kind: "course", data: course },
        message,
        recipientId,
        context,
      );
    }
    const hasMore = page
      ? !page.isDone
      : args.legacyOffset + DELIVERY_BATCH_SIZE < legacyStudents.length;
    if (hasMore)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.publish,
        {
          messageId: args.messageId,
          cursor: page?.continueCursor ?? null,
          legacyOffset: args.legacyOffset + DELIVERY_BATCH_SIZE,
        },
      );
    return null;
  },
});

export const markRead = mutation({
  args: { messageId: v.id("courseChatMessages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const message = await ctx.db.get("courseChatMessages", messageId);
    if (!message) return null;
    const source = await getChatSource(ctx, message);
    if (!source || !(await chatPermission(ctx, source, user._id, "read"))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (source.data.chatArchivedAt !== undefined) return null;
    const dedupeKey = chatNotificationKey(source, user._id);
    const notification = await ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if ((notification?.chatReadThrough ?? 0) >= message._creationTime)
      return null;
    if (source.kind === "course")
      await markEventNotificationsRead(
        ctx,
        user._id,
        source.data._id,
        message._creationTime,
      );
    const readFields = {
      readAt: Date.now(),
      chatReadThrough: Math.max(
        message._creationTime,
        notification?.chatReadThrough ?? 0,
      ),
    };
    if (notification) {
      await ctx.db.patch("systemNotifications", notification._id, {
        ...readFields,
        // A newer human message must remain unread even when older events were seen.
        readAt:
          notification.createdAt > message._creationTime
            ? notification.readAt
            : readFields.readAt,
      });
    } else {
      // A read can arrive before delivery. Keep its watermark in the same singleton
      // notification; a zero-count placeholder is never shown in the feed.
      await ctx.db.insert("systemNotifications", {
        recipientId: user._id,
        kind: source.kind === "course" ? "course_chat" : "broadcast_chat",
        ...sourceTarget(source),
        className: source.data.name,
        ...(source.kind === "course"
          ? await getClassNotificationContext(ctx, source.data)
          : { schoolId: source.data.schoolId, campusId: source.data.campusId }),
        dedupeKey,
        createdAt: 0,
        chatMessageCount: 0,
        ...readFields,
      });
    }
    return null;
  },
});

export const publishBroadcastCampuses = internalMutation({
  args: {
    messageId: v.id("courseChatMessages"),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("courseChatMessages", args.messageId);
    const broadcast = message?.broadcastId
      ? await ctx.db.get("broadcasts", message.broadcastId)
      : null;
    if (
      !broadcast ||
      broadcast.mode !== "school" ||
      broadcast.chatArchivedAt !== undefined
    )
      return null;
    const page = await ctx.db
      .query("campuses")
      .withIndex("by_school", (q) => q.eq("schoolId", broadcast.schoolId))
      .paginate({ cursor: args.cursor, numItems: 10 });
    for (const campus of page.page)
      if (campus.isActive)
        await scheduleBroadcastOrganization(
          ctx,
          args.messageId,
          broadcast,
          campus._id,
          "campus",
        );
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.publishBroadcastCampuses,
        { ...args, cursor: page.continueCursor },
      );
    return null;
  },
});

export const publishBroadcastMembers = internalMutation({
  args: {
    messageId: v.id("courseChatMessages"),
    orgId: v.string(),
    orgType: v.union(v.literal("school"), v.literal("campus")),
    role: v.union(
      v.literal("teacher"),
      v.literal("student"),
      v.literal("principal"),
      v.literal("admin"),
    ),
    gradeCode: v.optional(v.string()),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get("courseChatMessages", args.messageId);
    const broadcast = message?.broadcastId
      ? await ctx.db.get("broadcasts", message.broadcastId)
      : null;
    if (
      !message ||
      !broadcast ||
      broadcast.chatArchivedAt !== undefined ||
      message._creationTime <= (broadcast.chatNotificationsClearedThrough ?? 0)
    )
      return null;
    const page = await ctx.db
      .query("roleAssignments")
      .withIndex("by_orgId_and_orgType_and_role_and_gradeCode", (q) =>
        args.role === "student"
          ? q
              .eq("orgId", args.orgId)
              .eq("orgType", args.orgType)
              .eq("role", args.role)
              .eq("gradeCode", args.gradeCode)
          : q
              .eq("orgId", args.orgId)
              .eq("orgType", args.orgType)
              .eq("role", args.role),
      )
      .paginate({
        cursor: args.cursor,
        numItems: DELIVERY_BATCH_SIZE,
        maximumRowsRead: DELIVERY_BATCH_SIZE,
      });
    const [school, campus] = await Promise.all([
      ctx.db.get("schools", broadcast.schoolId),
      broadcast.campusId ? ctx.db.get("campuses", broadcast.campusId) : null,
    ]);
    const context = {
      schoolId: broadcast.schoolId,
      campusId: broadcast.campusId,
      schoolName: school?.name,
      campusName: campus?.name,
      organizationSlug: campus?.slug ?? school?.slug,
    };
    for (const membership of page.page) {
      if (
        !school?.isActive ||
        campus?.isActive === false ||
        membership.assignedAt > message._creationTime
      )
        continue;
      // Choose one canonical membership so multi-campus/multi-role readers count once.
      const { assignments } = await getBroadcastMemberships(
        ctx,
        membership.userId,
        broadcast,
      );
      const eligible = assignments.filter(
        (row) => row.assignedAt <= message._creationTime,
      );
      eligible.sort((a, b) => a._id.localeCompare(b._id));
      if (eligible[0]?._id === membership._id)
        await deliverChatNotification(
          ctx,
          { kind: "broadcast", data: broadcast },
          message,
          membership.userId,
          context,
        );
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.publishBroadcastMembers,
        { ...args, cursor: page.continueCursor },
      );
    return null;
  },
});

async function markEventNotificationsRead(
  ctx: MutationCtx,
  recipientId: Id<"users">,
  classId: Id<"classes">,
  through: number,
  cursor: string | null = null,
) {
  const page = await ctx.db
    .query("systemNotifications")
    .withIndex("by_recipientId_and_classId_and_readAt_and_createdAt", (q) =>
      q
        .eq("recipientId", recipientId)
        .eq("classId", classId)
        .eq("readAt", undefined)
        .lte("createdAt", through),
    )
    .paginate({
      cursor,
      numItems: CLEANUP_BATCH_SIZE,
      maximumRowsRead: CLEANUP_BATCH_SIZE,
    });
  for (const row of page.page)
    if (row.messageId)
      await ctx.db.patch("systemNotifications", row._id, {
        readAt: Date.now(),
      });
  if (!page.isDone)
    await ctx.scheduler.runAfter(
      0,
      internal.courseChatNotifications.acknowledgeEvents,
      { recipientId, classId, through, cursor: page.continueCursor },
    );
}

export const acknowledgeEvents = internalMutation({
  args: {
    recipientId: v.id("users"),
    classId: v.id("classes"),
    through: v.number(),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markEventNotificationsRead(
      ctx,
      args.recipientId,
      args.classId,
      args.through,
      args.cursor,
    );
    return null;
  },
});

export const listUnread = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      classId: v.optional(v.id("classes")),
      broadcastId: v.optional(v.id("broadcasts")),
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
        (item.classId || item.broadcastId) &&
        (item.kind === "course_chat" ||
          item.kind === "broadcast_chat" ||
          item.messageId)
          ? [
              {
                classId: item.classId,
                broadcastId: item.broadcastId,
                count: item.messageId ? 1 : (item.chatMessageCount ?? 0),
                campusId: item.campusId,
                schoolId: item.schoolId,
              },
            ]
          : [],
      ),
    };
  },
});

export const removeByClass = internalMutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", args.classId).eq("kind", "course_chat"),
      )
      .take(CLEANUP_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete("systemNotifications", row._id);
    if (rows.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.removeByClass,
        args,
      );
    return null;
  },
});

export const removeBroadcastDeliveries = internalMutation({
  args: { messageId: v.id("courseChatMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // A receipt must remain while its message can still be delivered.
    if (await ctx.db.get("courseChatMessages", args.messageId)) return null;
    const rows = await ctx.db
      .query("broadcastMessageDeliveries")
      .withIndex("by_messageId_and_userId", (q) =>
        q.eq("messageId", args.messageId),
      )
      .take(CLEANUP_BATCH_SIZE);
    for (const row of rows)
      await ctx.db.delete("broadcastMessageDeliveries", row._id);
    if (rows.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.removeBroadcastDeliveries,
        args,
      );
    return null;
  },
});
