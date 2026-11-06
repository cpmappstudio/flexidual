import { isCourseTeacher } from "./courseAssignments";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { UserRole } from "./roles";

export type SessionLeaderRole = Exclude<UserRole, "student" | "tutor">;

export const sessionLeaderRoleValidator = v.union(
  v.literal("teacher"),
  v.literal("principal"),
  v.literal("admin"),
  v.literal("superadmin"),
);

export const sessionLeaderValidator = v.union(
  v.null(),
  v.object({
    userId: v.id("users"),
    participantIdentity: v.string(),
    fullName: v.string(),
    imageUrl: v.optional(v.string()),
    role: sessionLeaderRoleValidator,
    since: v.number(),
  }),
);

/** One projection for class/event observers and the detailed staff controls. */
export function getSessionLeaderData(
  session: {
    sessionLeaderRole?: SessionLeaderRole;
    sessionLeaderSince?: number;
  },
  user: Doc<"users"> | null,
) {
  return user && session.sessionLeaderRole && session.sessionLeaderSince
    ? {
        userId: user._id,
        participantIdentity: user.clerkId,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
        role: session.sessionLeaderRole,
        since: session.sessionLeaderSince,
      }
    : null;
}

export const sessionLeadershipEventTypeValidator = v.union(
  v.literal("started"),
  v.literal("reopened"),
  v.literal("claimed"),
  v.literal("transferred"),
  v.literal("transfer_rejected"),
  v.literal("recovered"),
  v.literal("takeover"),
);

export const sessionClosureStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
);

export function getSessionLeaderRoleFromAssignments(
  userId: Id<"users">,
  classData: Doc<"classes">,
  schoolId: Id<"schools"> | undefined,
  assignments: Doc<"roleAssignments">[],
): SessionLeaderRole | null {
  if (isCourseTeacher(classData, userId)) return "teacher";
  if (
    assignments.some(
      (assignment) =>
        assignment.role === "superadmin" && assignment.orgType === "system",
    )
  ) {
    return "superadmin";
  }
  if (
    schoolId &&
    assignments.some(
      (assignment) =>
        assignment.role === "admin" &&
        assignment.orgType === "school" &&
        assignment.orgId === schoolId,
    )
  ) {
    return "admin";
  }
  const campusAssignment = assignments.find(
    (assignment) =>
      classData.campusId &&
      assignment.orgType === "campus" &&
      assignment.orgId === classData.campusId &&
      (assignment.role === "admin" || assignment.role === "principal"),
  );
  return campusAssignment?.role === "principal"
    ? "principal"
    : campusAssignment
      ? "admin"
      : null;
}
