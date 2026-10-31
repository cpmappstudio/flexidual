import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canManageCampusPeople, canManageInstitution } from "../permissions";
import { resolveMembershipSchoolId } from "./membership";
import { ConvexError } from "convex/values";

type Ctx = QueryCtx | MutationCtx;

export async function canManageBroadcast(
  ctx: Ctx,
  userId: Id<"users">,
  broadcast: Pick<Doc<"broadcasts">, "schoolId" | "campusId" | "mode">,
) {
  return broadcast.mode === "school"
    ? canManageInstitution(ctx, userId, broadcast.schoolId)
    : broadcast.campusId
      ? canManageCampusPeople(
          ctx,
          userId,
          broadcast.campusId,
          broadcast.schoolId,
        )
      : false;
}

export async function getBroadcastRole(
  ctx: Ctx,
  userId: Id<"users">,
  broadcast: Doc<"broadcasts">,
) {
  if (broadcast.deletingAt !== undefined) return null;
  const [user, campus, school] = await Promise.all([
    ctx.db.get("users", userId),
    broadcast.campusId ? ctx.db.get("campuses", broadcast.campusId) : null,
    ctx.db.get("schools", broadcast.schoolId),
  ]);
  if (
    !user?.isActive ||
    !school?.isActive ||
    (broadcast.mode === "private" && !campus?.isActive)
  )
    return null;
  if (await canManageBroadcast(ctx, userId, broadcast)) return "admin" as const;
  const { assignments } = await getBroadcastMemberships(ctx, userId, broadcast);
  if (assignments.some((row) => row.role === "teacher"))
    return "teacher" as const;
  if (assignments.some((row) => row.role === "principal"))
    return "reader" as const;
  return assignments.some((row) => row.role === "student")
    ? ("student" as const)
    : null;
}

export async function getBroadcastMemberships(
  ctx: Ctx,
  userId: Id<"users">,
  broadcast: Doc<"broadcasts">,
) {
  const user = await ctx.db.get("users", userId);
  if (!user?.isActive) return { user, assignments: [] };
  const memberships = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const assignments: Doc<"roleAssignments">[] = [];
  for (const assignment of memberships) {
    if (assignment.role === "tutor" || assignment.orgType === "system")
      continue;
    if (assignment.orgType === "campus") {
      const campusId = assignment.orgId
        ? ctx.db.normalizeId("campuses", assignment.orgId)
        : null;
      const campus = campusId ? await ctx.db.get("campuses", campusId) : null;
      if (!campus?.isActive || campus.schoolId !== broadcast.schoolId) continue;
    }
    const inScope =
      broadcast.mode === "private"
        ? assignment.orgType === "campus" &&
          assignment.orgId === broadcast.campusId
        : (assignment.schoolId ??
            (await resolveMembershipSchoolId(
              ctx,
              assignment.orgType,
              assignment.orgId,
            ))) === broadcast.schoolId;
    if (
      !inScope ||
      (assignment.role === "student" &&
        !broadcast.gradeCodes.includes(
          assignment.gradeCode ?? user.grade ?? "",
        ))
    )
      continue;
    assignments.push(assignment);
  }
  return { user, assignments };
}

export function getBroadcastWriter(
  ctx: Ctx,
  broadcastId: Id<"broadcasts">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("broadcastWriters")
    .withIndex("by_broadcastId_and_userId", (q) =>
      q.eq("broadcastId", broadcastId).eq("userId", userId),
    )
    .unique();
}

export async function addBroadcastParticipants(
  ctx: MutationCtx,
  broadcast: Doc<"broadcasts">,
  userIds: Id<"users">[],
) {
  for (const userId of userIds) {
    if ((await getBroadcastRole(ctx, userId, broadcast)) !== "teacher")
      throw new ConvexError("INVALID_CHAT_PARTICIPANT");
    // Retrying an addition must not unmute a professor disabled by another admin.
    if (!(await getBroadcastWriter(ctx, broadcast._id, userId)))
      await ctx.db.insert("broadcastWriters", {
        broadcastId: broadcast._id,
        userId,
        enabled: true,
      });
  }
}
