import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isValidTimeZone } from "../../lib/time-zone";
import { canAccessClass } from "../permissions";
import { getCourseTaskAccess } from "./courseTaskAccess";
import { getSurveyStaffRole } from "./surveyAccess";
import { getClassTimeZone } from "./timeZone";

export type SystemNotificationKind =
  | "course_enrollment"
  | "course_assignment"
  | "class_starting_soon"
  | "class_cancelled"
  | "calendar_closure"
  | "recording_available"
  | "role_changed"
  | "organization_membership_changed"
  | "course_chat"
  | "course_task"
  | "course_task_reminder"
  | "survey_invitation"
  | "announcement";

export type SystemNotificationAction = "added" | "removed" | "changed";

export type SystemNotificationInput = {
  recipientId: Id<"users">;
  kind: SystemNotificationKind;
  action?: SystemNotificationAction;
  actorId?: Id<"users">;
  schoolId?: Id<"schools">;
  campusId?: Id<"campuses">;
  classId?: Id<"classes">;
  taskId?: Id<"courseTasks">;
  messageId?: Id<"courseChatMessages">;
  taskTitle?: string;
  taskReminderGeneration?: number;
  scheduleId?: Id<"classSchedule">;
  recordingId?: Id<"recordings">;
  cancellationEventId?: Id<"classCancellationEvents">;
  calendarClosureId?: Id<"calendarClosures">;
  organizationSlug?: string;
  roomName?: string;
  className?: string;
  schoolName?: string;
  campusName?: string;
  previousOrganizationName?: string;
  role?: string;
  previousRole?: string;
  reason?: string;
  scheduledStart?: number;
  scheduledEnd?: number;
  announcementTitle?: string;
  announcementBody?: string;
  announcementUrl?: string;
  dedupeKey: string;
  surveyId?: string;
  createdAt?: number;
  chatMessageCount?: number;
  chatReadThrough?: number;
};

type VisibleNotification = Doc<"systemNotifications"> & {
  taskDueAt?: number;
  taskTimeZone?: string;
};

// Re-check course access on reads as enrollment/assignments can change independently.
async function getVisibleNotification(
  ctx: QueryCtx,
  notification: Doc<"systemNotifications">,
  includeTaskDetails: boolean,
): Promise<VisibleNotification | null> {
  if (notification.kind === "survey_invitation") {
    const campaign = await ctx.db
      .query("surveyCampaigns")
      .withIndex("by_survey_id", (q) =>
        q.eq("surveyId", notification.surveyId ?? ""),
      )
      .unique();
    if (!campaign?.enabled || !campaign.remoteActive) return null;
    const participation = await ctx.db
      .query("surveyParticipation")
      .withIndex("by_campaign_and_user", (q) =>
        q.eq("campaignId", campaign._id).eq("userId", notification.recipientId),
      )
      .unique();
    return participation &&
      participation.deliveryAllowed !== false &&
      participation.completedAt === undefined &&
      (await getSurveyStaffRole(
        ctx,
        participation.userId,
        participation.organizationSlug,
      ))
      ? notification
      : null;
  }
  if (
    notification.kind === "course_task" ||
    notification.kind === "course_task_reminder"
  ) {
    const task = notification.taskId
      ? await ctx.db.get("courseTasks", notification.taskId)
      : null;
    if (!task) return null;
    const access = await getCourseTaskAccess(
      ctx,
      task,
      notification.recipientId,
    );
    if (access.kind !== "student") return null;
    let reminderGeneration = notification.taskReminderGeneration;
    if (notification.messageId) {
      const message = await ctx.db.get(
        "courseChatMessages",
        notification.messageId,
      );
      if (
        !message?.event ||
        message.classId !== task.classId ||
        message.event.taskId !== task._id ||
        message.event.kind !== notification.kind ||
        access.course.chatArchivedAt !== undefined ||
        message._creationTime <=
          (access.course.chatNotificationsClearedThrough ?? 0)
      )
        return null;
      reminderGeneration = message.event.reminderGeneration;
      if (
        notification.kind === "course_task_reminder" &&
        task.dueAt !== message.event.reminderDueAt
      )
        return null;
    }
    if (
      notification.kind === "course_task_reminder" &&
      reminderGeneration !== undefined &&
      (access.recipient.submittedAt !== undefined ||
        !access.course.isActive ||
        task.manuallyClosedAt !== undefined ||
        task.reminderGeneration !== reminderGeneration)
    )
      return null;
    if (!includeTaskDetails) return notification;
    const timeZone =
      task.dueAt === undefined
        ? undefined
        : await getClassTimeZone(ctx, access.course);
    return {
      ...notification,
      taskTitle: task.title,
      className: access.course.name,
      ...(task.dueAt === undefined ? {} : { taskDueAt: task.dueAt }),
      ...(timeZone && isValidTimeZone(timeZone)
        ? { taskTimeZone: timeZone }
        : {}),
    };
  }
  if (notification.kind !== "course_chat") return notification;
  if (!notification.classId || !notification.chatMessageCount) return null;
  const course = await ctx.db.get("classes", notification.classId);
  return course &&
    course.chatArchivedAt === undefined &&
    notification.createdAt > (course.chatNotificationsClearedThrough ?? 0) &&
    (await canAccessClass(ctx, notification.recipientId, course))
    ? notification
    : null;
}

export function notificationPaginationOptions(options: PaginationOptions) {
  return {
    ...options,
    maximumRowsRead: Math.max(1, Math.min(options.maximumRowsRead ?? 100, 100)),
    maximumBytesRead: Math.max(
      1,
      Math.min(options.maximumBytesRead ?? 1_000_000, 1_000_000),
    ),
  };
}

export async function filterVisibleNotifications(
  ctx: QueryCtx,
  notifications: Doc<"systemNotifications">[],
  includeTaskDetails = false,
) {
  const visible = await Promise.all(
    notifications.map((item) =>
      getVisibleNotification(ctx, item, includeTaskDetails),
    ),
  );
  return visible.filter((item): item is VisibleNotification => item !== null);
}

export async function createSystemNotification(
  ctx: MutationCtx,
  input: SystemNotificationInput,
) {
  const recipient = await ctx.db.get("users", input.recipientId);
  if (!recipient?.isActive) return null;

  const existing = await ctx.db
    .query("systemNotifications")
    .withIndex("by_dedupe_key", (query) =>
      query.eq("dedupeKey", input.dedupeKey),
    )
    .unique();
  if (existing) return existing._id;

  const { createdAt = Date.now(), ...notification } = input;
  return await ctx.db.insert("systemNotifications", {
    ...notification,
    createdAt,
  });
}

export async function deleteStartingSoonNotifications(
  ctx: MutationCtx,
  scheduleIds: Id<"classSchedule">[],
) {
  for (const scheduleId of new Set(scheduleIds)) {
    const notifications = await ctx.db
      .query("systemNotifications")
      .withIndex("by_schedule_and_kind", (query) =>
        query.eq("scheduleId", scheduleId).eq("kind", "class_starting_soon"),
      )
      .collect();
    await Promise.all(
      notifications.map((notification) =>
        ctx.db.delete("systemNotifications", notification._id),
      ),
    );
  }
}
