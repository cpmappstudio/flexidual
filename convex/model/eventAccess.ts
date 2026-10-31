import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveMembershipSchoolId } from "./membership";

type DbCtx = QueryCtx | MutationCtx;

async function scopedAssignments(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Pick<Doc<"events">, "schoolId" | "campusId">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const scoped = [];
  for (const assignment of assignments) {
    if (assignment.role === "superadmin" && assignment.orgType === "system") {
      scoped.push(assignment);
      continue;
    }
    if (
      (assignment.schoolId ??
        (await resolveMembershipSchoolId(
          ctx,
          assignment.orgType,
          assignment.orgId,
        ))) !== event.schoolId
    )
      continue;
    if (assignment.orgType === "school" && assignment.orgId !== event.schoolId)
      continue;
    if (
      event.campusId &&
      assignment.orgType === "campus" &&
      assignment.orgId !== event.campusId
    )
      continue;
    scoped.push(assignment);
  }
  return scoped;
}

export async function getEventAccessAssignmentId(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Pick<Doc<"events">, "schoolId" | "campusId" | "gradeCodes">,
  assignedThrough?: number,
) {
  const user = await ctx.db.get(userId);
  if (!user?.isActive) return null;
  const assignments = await scopedAssignments(ctx, userId, event);
  return (
    assignments.find((assignment) => {
      if (
        assignedThrough !== undefined &&
        assignment.assignedAt > assignedThrough
      )
        return false;
      if (assignment.role === "tutor") return false;
      if (assignment.role !== "student") return true;
      if (
        event.campusId &&
        (assignment.orgType !== "campus" || assignment.orgId !== event.campusId)
      )
        return false;
      return (
        !event.gradeCodes ||
        event.gradeCodes.includes(assignment.gradeCode ?? user.grade ?? "")
      );
    })?._id ?? null
  );
}

export async function canAccessEvent(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Pick<Doc<"events">, "schoolId" | "campusId" | "gradeCodes">,
) {
  return (await getEventAccessAssignmentId(ctx, userId, event)) !== null;
}

export async function isEventStudent(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Doc<"events">,
) {
  const user = await ctx.db.get(userId);
  if (!user?.isActive) return false;
  const assignments = await scopedAssignments(ctx, userId, event);
  return assignments.some(
    (assignment) =>
      assignment.role === "student" &&
      (!event.campusId ||
        (assignment.orgType === "campus" &&
          assignment.orgId === event.campusId)) &&
      (!event.gradeCodes ||
        event.gradeCodes.includes(assignment.gradeCode ?? user.grade ?? "")),
  );
}

export async function canManageEvent(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Doc<"events">,
) {
  const assignments = await scopedAssignments(ctx, userId, event);
  return assignments.some(
    (assignment) =>
      (assignment.role === "superadmin" && assignment.orgType === "system") ||
      (assignment.role === "admin" && assignment.orgType === "school") ||
      (event.campusId &&
        assignment.role === "principal" &&
        assignment.orgType === "campus" &&
        assignment.orgId === event.campusId) ||
      (event.responsibleId === userId &&
        (assignment.role === "teacher" || assignment.role === "principal")),
  );
}

export async function canEditEvent(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Pick<Doc<"events">, "schoolId" | "campusId">,
) {
  return canCreateEvent(ctx, userId, event);
}

export async function canCancelEventOccurrence(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Doc<"events">,
) {
  return (
    (await canEditEvent(ctx, userId, event)) ||
    ((event.responsibleId === userId || event.teacherIds.includes(userId)) &&
      (await isEventTeacher(ctx, userId, event)))
  );
}

export async function canCreateEvent(
  ctx: DbCtx,
  userId: Id<"users">,
  scope: Pick<Doc<"events">, "schoolId" | "campusId">,
) {
  const assignments = await scopedAssignments(ctx, userId, scope);
  return assignments.some(
    (assignment) =>
      (assignment.role === "superadmin" && assignment.orgType === "system") ||
      (assignment.role === "admin" && assignment.orgType === "school") ||
      (scope.campusId &&
        assignment.role === "principal" &&
        assignment.orgType === "campus" &&
        assignment.orgId === scope.campusId),
  );
}

export async function isEventTeacher(
  ctx: DbCtx,
  userId: Id<"users">,
  scope: Pick<Doc<"events">, "schoolId" | "campusId">,
) {
  const user = await ctx.db.get(userId);
  if (!user?.isActive) return false;
  const assignments = await scopedAssignments(ctx, userId, scope);
  return assignments.some(
    (assignment) =>
      (assignment.role === "teacher" || assignment.role === "principal") &&
      (!scope.campusId ||
        (assignment.orgType === "campus" &&
          assignment.orgId === scope.campusId)),
  );
}
