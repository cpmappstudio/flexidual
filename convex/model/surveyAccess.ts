import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function getSurveyStaffRole(
  ctx: QueryCtx,
  userId: Id<"users">,
  orgSlug: string,
) {
  const user = await ctx.db.get("users", userId);
  const campus = await ctx.db
    .query("campuses")
    .withIndex("by_slug", (q) => q.eq("slug", orgSlug))
    .unique();
  if (!user?.isActive || !campus?.isActive) return null;
  const school = await ctx.db.get("schools", campus.schoolId);
  if (!school?.isActive) return null;
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", campus._id).eq("orgType", "campus"),
    )
    .take(20);
  if (assignments.some((item) => item.role === "principal")) return "principal";
  return assignments.some((item) => item.role === "teacher") ? "teacher" : null;
}
