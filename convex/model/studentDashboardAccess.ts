import type { QueryCtx } from "../_generated/server";
import { getCurrentUserFromAuth } from "../users";
import { canViewStudentProfile } from "../permissions";
import { getSoleStudentCampusId } from "./membership";

export async function resolveStudentDashboardAccess(
  ctx: QueryCtx,
  args: { studentId?: string; orgSlug?: string },
) {
  const viewer = await getCurrentUserFromAuth(ctx);
  if (!viewer) return null;

  const requestedStudentId = args.studentId
    ? ctx.db.normalizeId("users", args.studentId)
    : viewer._id;
  if (!requestedStudentId) return null;

  const student = await ctx.db.get("users", requestedStudentId);
  if (!student) return null;

  const viewingOwnProfile = student._id === viewer._id;
  let campus =
    args.studentId && args.orgSlug
      ? await ctx.db
          .query("campuses")
          .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug!))
          .first()
      : null;
  if (!args.studentId) {
    const studentCampusId = await getSoleStudentCampusId(ctx, student._id);
    campus = studentCampusId ? await ctx.db.get(studentCampusId) : null;
  }
  if (args.studentId && !campus) return null;

  if (campus) {
    const studentMembership = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user_org", (q) =>
        q
          .eq("userId", student._id)
          .eq("orgId", campus._id)
          .eq("orgType", "campus"),
      )
      .collect();
    if (!studentMembership.some(({ role }) => role === "student")) return null;
    if (
      !viewingOwnProfile &&
      !(await canViewStudentProfile(
        ctx,
        viewer._id,
        campus._id,
        campus.schoolId,
      ))
    )
      return null;
  }

  return { viewer, student, campus };
}
