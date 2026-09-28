import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getCurrentUserOrThrow } from "../users";
import { canManageInstitution } from "../permissions";
import { getStudentMembership } from "./membership";

export async function requireAbekaAdmin(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const school = await ctx.db.get(schoolId);
  if (
    !school?.isActive ||
    !(await canManageInstitution(ctx, user._id, schoolId))
  )
    throw new ConvexError("FORBIDDEN");
  return user;
}

export async function activeStudent(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
  userId: Id<"users">,
) {
  const user = await ctx.db.get(userId);
  if (!user?.isActive) return null;
  const membership = await getStudentMembership(ctx, userId, schoolId);
  if (!membership) return null;
  if (membership.orgType === "campus") {
    const campusId = ctx.db.normalizeId("campuses", membership.orgId ?? "");
    const campus = campusId ? await ctx.db.get(campusId) : null;
    if (!campus?.isActive || campus.schoolId !== schoolId) return null;
    return { user, campusId: campus._id, campusName: campus.name };
  }
  return { user, campusId: null, campusName: null };
}
