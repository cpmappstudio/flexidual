import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type SystemNotificationKind =
  | "course_enrollment"
  | "course_assignment"
  | "class_starting_soon"
  | "class_cancelled"
  | "recording_available"
  | "role_changed"
  | "organization_membership_changed"
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
  createdAt?: number;
};

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
        query
          .eq("scheduleId", scheduleId)
          .eq("kind", "class_starting_soon"),
      )
      .collect();
    await Promise.all(
      notifications.map((notification) =>
        ctx.db.delete("systemNotifications", notification._id),
      ),
    );
  }
}
