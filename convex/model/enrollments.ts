import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { toCivilDate, todayInTimeZone } from "../../lib/time-zone";
import { getClassTimeZone } from "./timeZone";

export function matchesCourseGrade(
  studentGrade: string | undefined,
  courseGrade: string | undefined,
  curriculumGrades: readonly string[] | undefined,
) {
  const allowedGrades = courseGrade ? [courseGrade] : curriculumGrades;
  return (
    !allowedGrades?.length ||
    Boolean(studentGrade && allowedGrades.includes(studentGrade))
  );
}

export function isEligibleForCourse(
  student: Doc<"users"> | null,
  membership: Doc<"roleAssignments"> | undefined,
  course: Pick<Doc<"classes">, "campusId" | "gradeCode">,
  curriculum: Pick<Doc<"curriculums">, "gradeCodes">,
) {
  return Boolean(
    student &&
      membership &&
      (!course.campusId ||
        (membership.orgType === "campus" &&
          membership.orgId === course.campusId)) &&
      matchesCourseGrade(
        membership.gradeCode ?? student.grade,
        course.gradeCode,
        curriculum.gradeCodes,
      ),
  );
}

async function hasCurrentGradeMismatch(
  ctx: MutationCtx,
  course: Doc<"classes">,
  gradeCode: string,
) {
  if (!course.isActive) return false;
  if (course.endDate !== undefined) {
    if (course.endDate < Date.now()) return false;
  } else {
    const period = course.academicPeriodId
      ? await ctx.db.get(course.academicPeriodId)
      : null;
    const timeZone = await getClassTimeZone(ctx, course);
    // Undated legacy courses require manual review, not destructive assumptions.
    if (
      !period ||
      !timeZone ||
      toCivilDate(period.endDate) < todayInTimeZone(timeZone)
    )
      return false;
  }
  const curriculum = course.gradeCode
    ? null
    : await ctx.db.get(course.curriculumId);
  return !matchesCourseGrade(
    gradeCode,
    course.gradeCode,
    curriculum?.gradeCodes,
  );
}

/** Remove current memberships only; attendance, grades and past courses are retained. */
export async function reconcileStudentGradeEnrollments(
  ctx: MutationCtx,
  studentId: Id<"users">,
  campusId: Id<"campuses">,
  gradeCode: string,
) {
  const enrollments = await ctx.db
    .query("classEnrollments")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  for (const enrollment of enrollments) {
    const course = await ctx.db.get(enrollment.classId);
    if (
      course?.campusId === campusId &&
      (await hasCurrentGradeMismatch(ctx, course, gradeCode))
    ) {
      await ctx.db.delete(enrollment._id);
    }
  }
  // Legacy rosters have no student index; scoped to this campus until their backfill is complete.
  const legacyCourses = await ctx.db
    .query("classes")
    .withIndex("by_campus", (q) =>
      q.eq("campusId", campusId).eq("isActive", true),
    )
    .filter((q) => q.eq(q.field("enrollmentsMigratedAt"), undefined))
    .collect();
  for (const course of legacyCourses) {
    if (
      course.students?.includes(studentId) &&
      (await hasCurrentGradeMismatch(ctx, course, gradeCode))
    ) {
      await ctx.db.patch(course._id, {
        students: course.students.filter((id) => id !== studentId),
      });
    }
  }
}

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
