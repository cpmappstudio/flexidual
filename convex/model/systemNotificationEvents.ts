import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listClassStudentIds } from "./enrollments";
import { createSystemNotification } from "./systemNotifications";

export async function getClassNotificationContext(
  ctx: MutationCtx,
  classData: Doc<"classes">,
) {
  const [school, campus] = await Promise.all([
    classData.schoolId ? ctx.db.get("schools", classData.schoolId) : null,
    classData.campusId ? ctx.db.get("campuses", classData.campusId) : null,
  ]);

  return {
    schoolId: school?._id,
    campusId: campus?._id,
    schoolName: school?.name,
    campusName: campus?.name,
    organizationSlug: campus?.slug ?? school?.slug,
  };
}

export async function listClassNotificationRecipients(
  ctx: MutationCtx,
  classData: Doc<"classes">,
) {
  const recipients = new Map<
    Id<"users">,
    "student" | "teacher" | "tutor"
  >();

  if (classData.teacherId) recipients.set(classData.teacherId, "teacher");
  if (classData.tutorId && !recipients.has(classData.tutorId)) {
    recipients.set(classData.tutorId, "tutor");
  }
  for (const studentId of await listClassStudentIds(ctx, classData)) {
    if (!recipients.has(studentId)) recipients.set(studentId, "student");
  }

  return recipients;
}

export async function publishCourseNotification(
  ctx: MutationCtx,
  args: {
    recipientId: Id<"users">;
    actorId: Id<"users">;
    classData: Doc<"classes">;
    kind: "course_enrollment" | "course_assignment";
    action: "added" | "removed";
    eventKey: string;
    role: "student" | "teacher" | "tutor";
    className?: string;
  },
) {
  if (args.recipientId === args.actorId) return null;
  const context = await getClassNotificationContext(ctx, args.classData);
  return await createSystemNotification(ctx, {
    recipientId: args.recipientId,
    actorId: args.actorId,
    kind: args.kind,
    action: args.action,
    classId: args.classData._id,
    className: args.className ?? args.classData.name,
    role: args.role,
    ...context,
    dedupeKey: `${args.kind}:${args.action}:${args.eventKey}:${args.recipientId}`,
  });
}
