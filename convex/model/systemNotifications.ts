import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessClass } from "../permissions";
import { getSurveyStaffRole } from "./surveyAccess";

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

// Re-check course access on reads as enrollment/assignments can change independently.
export async function isNotificationVisible(
  ctx: QueryCtx | MutationCtx,
  notification: Doc<"systemNotifications">,
) {
  if (notification.kind === "survey_invitation") {
    const campaign = await ctx.db
      .query("surveyCampaigns")
      .withIndex("by_survey_id", (q) =>
        q.eq("surveyId", notification.surveyId ?? ""),
      )
      .unique();
    if (!campaign?.enabled || !campaign.remoteActive) return false;
    const participation = await ctx.db
      .query("surveyParticipation")
      .withIndex("by_campaign_and_user", (q) =>
        q.eq("campaignId", campaign._id).eq("userId", notification.recipientId),
      )
      .unique();
    return Boolean(
      participation &&
        participation.deliveryAllowed !== false &&
        participation.completedAt === undefined &&
        (await getSurveyStaffRole(
          ctx,
          participation.userId,
          participation.organizationSlug,
        )),
    );
  }
  if (notification.kind !== "course_chat") return true;
  if (!notification.classId || !notification.chatMessageCount) return false;
  const course = await ctx.db.get("classes", notification.classId);
  return Boolean(
    course &&
      course.chatArchivedAt === undefined &&
      notification.createdAt > (course.chatNotificationsClearedThrough ?? 0) &&
      (await canAccessClass(ctx, notification.recipientId, course)),
  );
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
) {
  const visible = await Promise.all(
    notifications.map((item) => isNotificationVisible(ctx, item)),
  );
  return notifications.filter((_, index) => visible[index]);
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
