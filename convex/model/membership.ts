import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
type OrganizationType = "system" | "school" | "campus";

export async function resolveMembershipSchoolId(
  ctx: DbCtx,
  orgType: OrganizationType,
  orgId?: string,
): Promise<Id<"schools"> | undefined> {
  if (orgType === "system" || !orgId) return undefined;
  if (orgType === "school") {
    return ctx.db.normalizeId("schools", orgId) ?? undefined;
  }

  const campusId = ctx.db.normalizeId("campuses", orgId);
  if (!campusId) return undefined;
  return (await ctx.db.get(campusId))?.schoolId;
}

async function belongsToSchool(
  ctx: DbCtx,
  assignment: Doc<"roleAssignments">,
  schoolId: Id<"schools">,
) {
  if (assignment.schoolId) return assignment.schoolId === schoolId;
  return (
    (await resolveMembershipSchoolId(
      ctx,
      assignment.orgType,
      assignment.orgId,
    )) === schoolId
  );
}

export async function getStudentMembership(
  ctx: DbCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
  campusId?: Id<"campuses">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const matches: Doc<"roleAssignments">[] = [];
  for (const assignment of assignments) {
    if (
      assignment.role === "student" &&
      (await belongsToSchool(ctx, assignment, schoolId))
    ) {
      matches.push(assignment);
    }
  }

  return (
    matches.find(
      (assignment) =>
        campusId &&
        assignment.orgType === "campus" &&
        assignment.orgId === campusId,
    ) ??
    matches.find(
      (assignment) =>
        assignment.orgType === "school" && assignment.orgId === schoolId,
    ) ??
    matches[0]
  );
}

export async function getStudentGradeCode(
  ctx: DbCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
  campusId?: Id<"campuses">,
) {
  const membership = await getStudentMembership(
    ctx,
    userId,
    schoolId,
    campusId,
  );
  if (membership?.gradeCode) return membership.gradeCode;

  // ponytail: remove this fallback after backfillInstitutionMemberships has run in production.
  return (await ctx.db.get(userId))?.grade;
}

export async function getStudentSchoolIds(
  ctx: DbCtx,
  userId: Id<"users">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const schoolIds = new Set<Id<"schools">>();
  for (const assignment of assignments) {
    if (assignment.role !== "student") continue;
    const schoolId =
      assignment.schoolId ??
      (await resolveMembershipSchoolId(
        ctx,
        assignment.orgType,
        assignment.orgId,
      ));
    if (schoolId) schoolIds.add(schoolId);
  }
  return schoolIds;
}

export async function listInstitutionStudentMemberships(
  ctx: DbCtx,
  schoolId: Id<"schools">,
) {
  const indexed = await ctx.db
    .query("roleAssignments")
    .withIndex("by_school_role_grade", (q) =>
      q.eq("schoolId", schoolId).eq("role", "student"),
    )
    .collect();

  // ponytail: remove the legacy branch after the production backfill.
  const campuses = await ctx.db
    .query("campuses")
    .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
    .collect();
  const legacy = (
    await Promise.all([
      ctx.db
        .query("roleAssignments")
        .withIndex("by_org", (q) =>
          q.eq("orgId", schoolId).eq("orgType", "school"),
        )
        .collect(),
      ...campuses.map((campus) =>
        ctx.db
          .query("roleAssignments")
          .withIndex("by_org", (q) =>
            q.eq("orgId", campus._id).eq("orgType", "campus"),
          )
          .collect(),
      ),
    ])
  )
    .flat()
    .filter(
      (assignment) =>
        assignment.role === "student" && assignment.schoolId === undefined,
    );

  return [...indexed, ...legacy];
}
