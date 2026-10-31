import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { peopleDirectoryFields } from "./peopleDirectoryFields";
import { listActiveStudentClasses } from "./enrollments";
import { syncTeacherStudentDirectory } from "./teacherPeopleDirectory";
import { getCourseTeacherIds } from "./courseAssignments";
export {
  peopleDirectoryFields,
  peopleDirectoryValidator,
} from "./peopleDirectoryFields";

export async function syncPeopleDirectory(
  ctx: MutationCtx,
  userId: Id<"users">,
  { refreshRelationships = false }: { refreshRelationships?: boolean } = {},
) {
  const user = await ctx.db.get("users", userId);
  if (!user) return;
  const campuses = new Set<Id<"campuses">>();
  for await (const membership of ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (
      membership.role === "student" &&
      membership.orgType === "campus" &&
      membership.orgId
    ) {
      const campusId = ctx.db.normalizeId("campuses", membership.orgId);
      if (campusId) campuses.add(campusId);
    }
    const directory = peopleDirectoryFields(user, membership.gradeCode);
    if (
      Object.entries(directory).some(
        ([key, value]) =>
          membership.directory?.[key as keyof typeof directory] !== value,
      )
    )
      await ctx.db.patch("roleAssignments", membership._id, { directory });
  }
  const pairs = new Map<
    string,
    { campusId: Id<"campuses">; teacherId: Id<"users"> }
  >();
  for await (const edge of ctx.db
    .query("teacherStudentDirectory")
    .withIndex("by_studentId", (q) => q.eq("studentId", userId))) {
    pairs.set(`${edge.campusId}:${edge.teacherId}`, edge);
  }
  // Profile edits update existing edges; only a new membership discovers rosters.
  if (refreshRelationships)
    for (const campusId of campuses)
      for (const course of await listActiveStudentClasses(
        ctx,
        userId,
        campusId,
      ))
        for (const teacherId of getCourseTeacherIds(course))
          pairs.set(`${campusId}:${teacherId}`, { campusId, teacherId });
  for (const { campusId, teacherId } of pairs.values())
    await syncTeacherStudentDirectory(ctx, campusId, teacherId, userId);
}
