import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { canAccessClass } from "./permissions";
import { getCurrentUserOrThrow } from "./users";
import { getClassNotificationContext } from "./model/systemNotificationEvents";
import {
  filterVisibleNotifications,
  notificationPaginationOptions,
} from "./model/systemNotifications";

const BATCH_SIZE = 50;
const notificationKey = (classId: Id<"classes">, userId: Id<"users">) =>
  `course_chat:${classId}:${userId}`;

// Scheduled mutations run exactly once. Each message visits each recipient once,
// in bounded batches, without loading the course's message history.
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
    const course = await ctx.db.get("classes", message.classId);
    if (
      !course ||
      course.chatArchivedAt !== undefined ||
      message._creationTime <= (course.chatNotificationsClearedThrough ?? 0)
    )
      return null;

    const page = course.enrollmentsMigratedAt
      ? await ctx.db
          .query("classEnrollments")
          .withIndex("by_class", (q) => q.eq("classId", course._id))
          .paginate({ cursor: args.cursor, numItems: BATCH_SIZE })
      : null;
    const legacyStudents = course.students ?? [];
    const students = page
      ? page.page
          .filter((entry) => entry.enrolledAt <= message._creationTime)
          .map((entry) => entry.studentId)
      : legacyStudents.slice(args.legacyOffset, args.legacyOffset + BATCH_SIZE);
    const staff = [course.teacherId, course.tutorId].filter(
      (id): id is Id<"users"> => id !== undefined,
    );
    const firstBatch = args.cursor === null && args.legacyOffset === 0;
    const recipients = new Set([
      ...(firstBatch ? staff : []),
      ...students.filter((id) => !staff.includes(id)),
    ]);
    recipients.delete(message.authorId);
    const context = await getClassNotificationContext(ctx, course);
    for (const recipientId of recipients) {
      const recipient = await ctx.db.get("users", recipientId);
      if (!recipient?.isActive) continue;
      const dedupeKey = notificationKey(course._id, recipientId);
      const existing = await ctx.db
        .query("systemNotifications")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      if (message._creationTime <= (existing?.chatReadThrough ?? 0)) continue;
      const resetCount =
        !existing ||
        existing.readAt !== undefined ||
        existing.createdAt <= (course.chatNotificationsClearedThrough ?? 0);
      const fields = {
        recipientId,
        kind: "course_chat" as const,
        classId: course._id,
        className: course.name,
        ...context,
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
    const hasMore = page
      ? !page.isDone
      : args.legacyOffset + BATCH_SIZE < legacyStudents.length;
    if (hasMore)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.publish,
        {
          messageId: args.messageId,
          cursor: page?.continueCursor ?? null,
          legacyOffset: args.legacyOffset + BATCH_SIZE,
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
    const course = await ctx.db.get("classes", message.classId);
    if (!course || !(await canAccessClass(ctx, user._id, course))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (course.chatArchivedAt !== undefined) return null;
    const dedupeKey = notificationKey(course._id, user._id);
    const notification = await ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    // Never acknowledge a message that arrived after the one the client displayed.
    if (
      notification &&
      (notification.createdAt > message._creationTime ||
        (notification.chatReadThrough ?? 0) >= message._creationTime)
    )
      return null;
    const readFields = {
      readAt: Date.now(),
      chatReadThrough: message._creationTime,
    };
    if (notification) {
      await ctx.db.patch("systemNotifications", notification._id, readFields);
    } else {
      // A read can arrive before delivery. Keep its watermark in the same singleton
      // notification; a zero-count placeholder is never shown in the feed.
      await ctx.db.insert("systemNotifications", {
        recipientId: user._id,
        kind: "course_chat",
        classId: course._id,
        className: course.name,
        ...(await getClassNotificationContext(ctx, course)),
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
      classId: v.id("classes"),
      count: v.number(),
      campusId: v.optional(v.id("campuses")),
      schoolId: v.optional(v.id("schools")),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const result = await ctx.db
      .query("systemNotifications")
      .withIndex("by_recipient_and_kind_and_read_at", (q) =>
        q
          .eq("recipientId", user._id)
          .eq("kind", "course_chat")
          .eq("readAt", undefined),
      )
      .paginate(notificationPaginationOptions(args.paginationOpts));
    const visible = await filterVisibleNotifications(ctx, result.page);
    return {
      ...result,
      page: visible.flatMap((item) =>
        item.classId
          ? [
              {
                classId: item.classId,
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

export const removeByClass = internalMutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", args.classId).eq("kind", "course_chat"),
      )
      .take(BATCH_SIZE);
    for (const row of rows) await ctx.db.delete("systemNotifications", row._id);
    if (rows.length === BATCH_SIZE)
      await ctx.scheduler.runAfter(
        0,
        internal.courseChatNotifications.removeByClass,
        args,
      );
    return null;
  },
});
