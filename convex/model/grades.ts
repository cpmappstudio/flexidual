import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getInstitutionGrades(
  ctx: QueryCtx | MutationCtx,
  schoolId: Id<"schools">,
) {
  return await ctx.db
    .query("institutionGrades")
    .withIndex("by_school_and_order", (q) => q.eq("schoolId", schoolId))
    .collect();
}

export async function validateGradeCodes(
  ctx: QueryCtx | MutationCtx,
  schoolId: Id<"schools">,
  codes: string[],
) {
  const uniqueCodes = [...new Set(codes)];
  const offered = await Promise.all(
    uniqueCodes.map((code) =>
      ctx.db
        .query("institutionGrades")
        .withIndex("by_school_and_code", (q) =>
          q.eq("schoolId", schoolId).eq("code", code),
        )
        .unique(),
    ),
  );
  return uniqueCodes.filter((_, index) => offered[index] === null);
}

export async function resolveSchoolId(
  ctx: QueryCtx | MutationCtx,
  orgType: "system" | "school" | "campus",
  orgId?: string,
) {
  if (!orgId || orgType === "system") return null;
  if (orgType === "school") {
    const school = await ctx.db.get(orgId as Id<"schools">);
    return school?._id ?? null;
  }
  const campus = await ctx.db.get(orgId as Id<"campuses">);
  return campus?.schoolId ?? null;
}
