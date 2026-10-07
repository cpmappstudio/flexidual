import type { Doc } from "@/convex/_generated/dataModel";

type NavigableNotification = Pick<
  Doc<"systemNotifications">,
  | "kind"
  | "action"
  | "organizationSlug"
  | "classId"
  | "roomName"
  | "surveyId"
  | "taskId"
  | "messageId"
>;

export function getSystemNotificationHref(notification: NavigableNotification) {
  const orgSlug = notification.organizationSlug;
  if (!orgSlug) return null;
  if (
    notification.messageId &&
    notification.classId &&
    notification.action !== "removed"
  ) {
    return `/${orgSlug}/chats/${notification.classId}?message=${encodeURIComponent(notification.messageId)}`;
  }
  if (notification.kind === "survey_invitation" && notification.surveyId) {
    return `/${orgSlug}/catalog?survey=${encodeURIComponent(notification.surveyId)}`;
  }
  if (notification.kind === "course_chat" && notification.classId) {
    return `/${orgSlug}/chats/${notification.classId}`;
  }

  if (notification.kind === "class_starting_soon" && notification.roomName) {
    return `/${orgSlug}/classroom/${encodeURIComponent(notification.roomName)}`;
  }
  if (
    (notification.kind === "course_task" ||
      notification.kind === "course_task_reminder") &&
    notification.action !== "removed" &&
    notification.classId &&
    notification.taskId
  ) {
    return `/${orgSlug}/classes/${notification.classId}?task=${encodeURIComponent(notification.taskId)}`;
  }
  if (
    notification.kind === "class_cancelled" ||
    notification.kind === "calendar_closure"
  ) {
    return `/${orgSlug}/calendar`;
  }
  if (
    (notification.kind === "course_enrollment" ||
      notification.kind === "course_assignment" ||
      notification.kind === "course_task" ||
      notification.kind === "course_task_reminder" ||
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
