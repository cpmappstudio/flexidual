import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import {
  createSystemNotification,
  deleteStartingSoonNotifications,
  type SystemNotificationInput,
} from "./model/systemNotifications";
import {
  getClassNotificationContext,
  listClassNotificationRecipients,
} from "./model/systemNotificationEvents";
import { getCurrentUserOrThrow } from "./users";

const notificationKindValidator = v.union(
  v.literal("course_enrollment"),
  v.literal("course_assignment"),
  v.literal("class_starting_soon"),
  v.literal("class_cancelled"),
  v.literal("recording_available"),
  v.literal("role_changed"),
  v.literal("organization_membership_changed"),
  v.literal("announcement"),
);

const notificationActionValidator = v.union(
  v.literal("added"),
  v.literal("removed"),
  v.literal("changed"),
);

const notificationPayloadFields = {
  recipientId: v.id("users"),
  kind: notificationKindValidator,
  action: v.optional(notificationActionValidator),
  actorId: v.optional(v.id("users")),
  schoolId: v.optional(v.id("schools")),
  campusId: v.optional(v.id("campuses")),
  classId: v.optional(v.id("classes")),
  scheduleId: v.optional(v.id("classSchedule")),
  recordingId: v.optional(v.id("recordings")),
  cancellationEventId: v.optional(v.id("classCancellationEvents")),
  organizationSlug: v.optional(v.string()),
  roomName: v.optional(v.string()),
  className: v.optional(v.string()),
  schoolName: v.optional(v.string()),
  campusName: v.optional(v.string()),
  previousOrganizationName: v.optional(v.string()),
  role: v.optional(v.string()),
  previousRole: v.optional(v.string()),
  reason: v.optional(v.string()),
  scheduledStart: v.optional(v.number()),
  scheduledEnd: v.optional(v.number()),
  announcementTitle: v.optional(v.string()),
  announcementBody: v.optional(v.string()),
  announcementUrl: v.optional(v.string()),
  dedupeKey: v.string(),
};

const notificationFields = {
  ...notificationPayloadFields,
  createdAt: v.number(),
  readAt: v.optional(v.number()),
};

const notificationValidator = v.object({
  _id: v.id("systemNotifications"),
  _creationTime: v.number(),
  ...notificationFields,
});

const publishArgs = {
  ...notificationPayloadFields,
  createdAt: v.optional(v.number()),
};

const unreadLimit = 100;
const markReadBatchSize = 100;
const upcomingClassWindowMs = 5 * 60 * 1000;
const upcomingClassBatchSize = 500;

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(notificationValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await ctx.db
      .query("systemNotifications")
      .withIndex("by_recipient_and_created_at", (index) =>
        index.eq("recipientId", user._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const notifications = await ctx.db
      .query("systemNotifications")
      .withIndex("by_recipient_and_read_at_and_created_at", (index) =>
        index.eq("recipientId", user._id).eq("readAt", undefined),
      )
      .take(unreadLimit);
    return notifications.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("systemNotifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const notification = await ctx.db.get(
      "systemNotifications",
      args.notificationId,
    );
    if (!notification || notification.recipientId !== user._id) return null;
    if (notification.readAt === undefined) {
      await ctx.db.patch("systemNotifications", notification._id, {
        readAt: Date.now(),
      });
    }
    return null;
  },
});

async function markUnreadBatch(
  ctx: Parameters<typeof createSystemNotification>[0],
  recipientId: SystemNotificationInput["recipientId"],
) {
  const unread = await ctx.db
    .query("systemNotifications")
    .withIndex("by_recipient_and_read_at_and_created_at", (index) =>
      index.eq("recipientId", recipientId).eq("readAt", undefined),
    )
    .take(markReadBatchSize);
  const readAt = Date.now();
  await Promise.all(
    unread.map((notification) =>
      ctx.db.patch("systemNotifications", notification._id, { readAt }),
    ),
  );
  return unread.length;
}

export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    const marked = await markUnreadBatch(ctx, user._id);
    if (marked === markReadBatchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.systemNotifications.markAllReadInternal,
        { recipientId: user._id },
      );
    }
    return null;
  },
});

export const markAllReadInternal = internalMutation({
  args: { recipientId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const marked = await markUnreadBatch(ctx, args.recipientId);
    if (marked === markReadBatchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.systemNotifications.markAllReadInternal,
        args,
      );
    }
    return null;
  },
});

export const publish = internalMutation({
  args: publishArgs,
  returns: v.union(v.id("systemNotifications"), v.null()),
  handler: async (ctx, args) =>
    await createSystemNotification(ctx, args as SystemNotificationInput),
});

export const publishUpcomingClasses = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const schedules = await ctx.db
      .query("classSchedule")
      .withIndex("by_status", (index) =>
        index
          .eq("status", "scheduled")
          .gt("scheduledStart", now)
          .lte("scheduledStart", now + upcomingClassWindowMs),
      )
      .take(upcomingClassBatchSize);

    let published = 0;
    for (const schedule of schedules) {
      if (
        schedule.sessionType !== undefined &&
        schedule.sessionType !== "live"
      ) {
        continue;
      }
      const classData = await ctx.db.get("classes", schedule.classId);
      if (!classData?.isActive) continue;

      const [context, recipients] = await Promise.all([
        getClassNotificationContext(ctx, classData),
        listClassNotificationRecipients(ctx, classData),
      ]);
      for (const [recipientId, role] of recipients) {
        const notificationId = await createSystemNotification(ctx, {
          recipientId,
          kind: "class_starting_soon",
          classId: classData._id,
          scheduleId: schedule._id,
          className: classData.name,
          roomName: schedule.roomName,
          role,
          scheduledStart: schedule.scheduledStart,
          scheduledEnd: schedule.scheduledEnd,
          ...context,
          dedupeKey: `class_starting_soon:${schedule._id}:${recipientId}`,
        });
        if (notificationId) published += 1;
      }
    }

    return published;
  },
});

export const publishClassCancellation = internalMutation({
  args: { cancellationEventId: v.id("classCancellationEvents") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(
      "classCancellationEvents",
      args.cancellationEventId,
    );
    if (!event) return 0;

    await deleteStartingSoonNotifications(ctx, event.affectedScheduleIds);
    const [classData, schedule] = await Promise.all([
      ctx.db.get("classes", event.classId),
      ctx.db.get("classSchedule", event.scheduleId),
    ]);
    if (!classData || !schedule) return 0;

    const [context, recipients] = await Promise.all([
      getClassNotificationContext(ctx, classData),
      listClassNotificationRecipients(ctx, classData),
    ]);
    let published = 0;
    for (const [recipientId, role] of recipients) {
      if (recipientId === event.actorId) continue;
      const notificationId = await createSystemNotification(ctx, {
        recipientId,
        kind: "class_cancelled",
        actorId: event.actorId,
        classId: classData._id,
        scheduleId: schedule._id,
        cancellationEventId: event._id,
        className: classData.name,
        role,
        reason: event.reason,
        scheduledStart: schedule.scheduledStart,
        scheduledEnd: schedule.scheduledEnd,
        ...context,
        dedupeKey: `class_cancelled:${event._id}:${recipientId}`,
      });
      if (notificationId) published += 1;
    }
    return published;
  },
});
