import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function listClassStudentIds(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
) {
  if (!classData.enrollmentsMigratedAt) return classData.students ?? [];
  const enrollments = await ctx.db
    .query("classEnrollments")
    .withIndex("by_class", (q) => q.eq("classId", classData._id))
    .collect();
  return enrollments.map((enrollment) => enrollment.studentId);
}

export async function isStudentEnrolled(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
  studentId: Id<"users">,
) {
  if (!classData.enrollmentsMigratedAt) {
    return classData.students?.includes(studentId) ?? false;
  }
  return Boolean(
    await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", classData._id).eq("studentId", studentId),
      )
      .unique(),
  );
}

export async function ensureClassEnrollmentsMigrated(
  ctx: MutationCtx,
  classData: Doc<"classes">,
  migratedBy: Id<"users">,
) {
  if (classData.enrollmentsMigratedAt) return;
  const now = Date.now();
  for (const studentId of new Set(classData.students ?? [])) {
    await ctx.db.insert("classEnrollments", {
      classId: classData._id,
      studentId,
      enrolledAt: now,
      enrolledBy: migratedBy,
    });
  }
  await ctx.db.patch(classData._id, { enrollmentsMigratedAt: now });
}
