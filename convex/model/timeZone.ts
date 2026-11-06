import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Documents already read by the caller within the current transaction. */
export type ClassScopeDocuments = {
  curriculum: Doc<"curriculums"> | null;
  campus: Doc<"campuses"> | null;
};

export async function getClassTimeZone(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
  loadedScope?: ClassScopeDocuments,
) {
  if (classData.timeZone) return classData.timeZone;

  const [curriculum, campus] = await Promise.all([
    loadedScope
      ? loadedScope.curriculum
      : ctx.db.get("curriculums", classData.curriculumId),
    loadedScope
      ? loadedScope.campus
      : classData.campusId
        ? ctx.db.get("campuses", classData.campusId)
        : null,
  ]);
  const schoolId = campus?.schoolId ?? curriculum?.schoolId;
  const school = schoolId ? await ctx.db.get("schools", schoolId) : null;
  return campus?.timeZone ?? school?.timeZone;
}
