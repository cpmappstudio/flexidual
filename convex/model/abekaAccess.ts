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

export async function getManagedAbekaConnection(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
) {
  await requireAbekaAdmin(ctx, schoolId);
  return ctx.db
    .query("abekaConnections")
    .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
    .unique();
}

// Call inside the class mutation, after authorization and before any writes.
// Reading the connection makes the first/last batch participate in Convex OCC;
// the saved cursor protects already copied rows between batch transactions.
export async function assertAbekaClassLinkNotMigrating(
  ctx: QueryCtx,
  classId: Id<"classes">,
  schoolId: Id<"schools"> | undefined,
) {
  if (!schoolId) return;
  const connection = await ctx.db
    .query("abekaConnections")
    .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
    .unique();
  if (
    !connection ||
    connection.curriculumLinksMigratedAt !== undefined ||
    connection.curriculumLinksMigrationCursor === undefined
  )
    return;
  const link = await ctx.db
    .query("abekaCourseLinks")
    .withIndex("by_connectionId_and_classId", (q) =>
      q.eq("connectionId", connection._id).eq("classId", classId),
    )
    .unique();
  if (link) throw new ConvexError("ABEKA_CURRICULUM_MIGRATION_IN_PROGRESS");
}
