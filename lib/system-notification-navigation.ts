import type { Doc } from "@/convex/_generated/dataModel";

type NavigableNotification = Pick<
  Doc<"systemNotifications">,
  | "kind"
  | "action"
  | "organizationSlug"
  | "classId"
  | "roomName"
>;

export function getSystemNotificationHref(
  notification: NavigableNotification,
) {
  const orgSlug = notification.organizationSlug;
  if (!orgSlug) return null;

  if (notification.kind === "class_starting_soon" && notification.roomName) {
    return `/${orgSlug}/classroom/${encodeURIComponent(notification.roomName)}`;
  }
  if (notification.kind === "class_cancelled") {
    return `/${orgSlug}/calendar`;
  }
  if (
    (notification.kind === "course_enrollment" ||
      notification.kind === "course_assignment" ||
      notification.kind === "recording_available") &&
    notification.classId
  ) {
    if (notification.action === "removed") return null;
    return `/${orgSlug}/classes/${notification.classId}`;
  }
  if (
    notification.kind === "role_changed" ||
    (notification.kind === "organization_membership_changed" &&
      notification.action !== "removed")
  ) {
    return `/${orgSlug}`;
  }
  return null;
}
