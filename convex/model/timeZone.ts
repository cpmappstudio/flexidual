import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getClassTimeZone(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
) {
  if (classData.timeZone) return classData.timeZone;

  const [curriculum, campus] = await Promise.all([
    ctx.db.get(classData.curriculumId),
    classData.campusId ? ctx.db.get(classData.campusId) : null,
  ]);
  const schoolId = campus?.schoolId ?? curriculum?.schoolId;
  const school = schoolId ? await ctx.db.get(schoolId) : null;
  return campus?.timeZone ?? school?.timeZone;
}
