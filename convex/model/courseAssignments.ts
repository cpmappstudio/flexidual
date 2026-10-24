import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const courseGradeAssignmentValidator = v.object({
  gradeCode: v.string(),
  teacherId: v.optional(v.id("users")),
});

type CourseAssignments = Pick<
  Doc<"classes">,
  "gradeCode" | "teacherId" | "gradeAssignments"
>;

export function getCourseGradeCodes(
  course: Pick<CourseAssignments, "gradeCode" | "gradeAssignments">,
) {
  return course.gradeAssignments?.length
    ? course.gradeAssignments.map(({ gradeCode }) => gradeCode)
    : course.gradeCode
      ? [course.gradeCode]
      : [];
}

export function getCourseTeacherIds(
  course: Pick<CourseAssignments, "teacherId" | "gradeAssignments">,
) {
  return [
    ...new Set(
      [
        course.teacherId,
        ...(course.gradeAssignments?.map(({ teacherId }) => teacherId) ?? []),
      ].filter((id): id is Id<"users"> => id !== undefined),
    ),
  ];
}

export function getCourseTeacherForGrade(
  course: Pick<CourseAssignments, "teacherId" | "gradeAssignments">,
  gradeCode?: string,
) {
  return (
    course.gradeAssignments?.find(
      (assignment) => assignment.gradeCode === gradeCode,
    )?.teacherId ?? course.teacherId
  );
}

export function isCourseTeacher(
  course: Pick<CourseAssignments, "teacherId" | "gradeAssignments">,
  userId: Id<"users"> | undefined,
) {
  return (
    userId !== undefined &&
    (course.teacherId === userId ||
      course.gradeAssignments?.some(
        (assignment) => assignment.teacherId === userId,
      ) === true)
  );
}

export async function listTeacherClasses(
  ctx: QueryCtx | MutationCtx,
  teacherId: Id<"users">,
  isActive = true,
  scope?: {
    campusId: Id<"campuses">;
    academicPeriodId?: Id<"academicPeriods">;
  },
) {
  const primary = await (
    scope
      ? ctx.db
          .query("classes")
          .withIndex("by_teacher_campus_active_period", (q) => {
            const scoped = q
              .eq("teacherId", teacherId)
              .eq("campusId", scope.campusId)
              .eq("isActive", isActive);
            return scope.academicPeriodId === undefined
              ? scoped
              : scoped.eq("academicPeriodId", scope.academicPeriodId);
          })
      : ctx.db
          .query("classes")
          .withIndex("by_teacher", (q) =>
            q.eq("teacherId", teacherId).eq("isActive", isActive),
          )
  ).collect();
  const classes = new Map(primary.map((course) => [course._id, course]));
  const assignments = scope
    ? ctx.db
        .query("classGradeAssignments")
        .withIndex("by_teacherId_and_campusId_and_academicPeriodId", (q) => {
          const scoped = q
            .eq("teacherId", teacherId)
            .eq("campusId", scope.campusId);
          return scope.academicPeriodId === undefined
            ? scoped
            : scoped.eq("academicPeriodId", scope.academicPeriodId);
        })
    : ctx.db
        .query("classGradeAssignments")
        .withIndex("by_teacherId_and_classId", (q) =>
          q.eq("teacherId", teacherId),
        );
  for await (const assignment of assignments) {
    if (classes.has(assignment.classId)) continue;
    const course = await ctx.db.get("classes", assignment.classId);
    if (
      course?.isActive === isActive &&
      isCourseTeacher(course, teacherId) &&
      (!scope ||
        (course.campusId === scope.campusId &&
          (scope.academicPeriodId === undefined ||
            course.academicPeriodId === scope.academicPeriodId)))
    )
      classes.set(course._id, course);
  }
  return [...classes.values()];
}

export async function listGradeClasses(
  ctx: QueryCtx,
  campusId: Id<"campuses">,
  academicPeriodId: Id<"academicPeriods">,
  gradeCode: string,
) {
  const primary = await ctx.db
    .query("classes")
    .withIndex("by_campus_period_grade", (q) =>
      q
        .eq("campusId", campusId)
        .eq("academicPeriodId", academicPeriodId)
        .eq("gradeCode", gradeCode)
        .eq("isActive", true),
    )
    .collect();
  const classes = new Map(primary.map((course) => [course._id, course]));
  for await (const assignment of ctx.db
    .query("classGradeAssignments")
    .withIndex("by_campusId_and_academicPeriodId_and_gradeCode", (q) =>
      q
        .eq("campusId", campusId)
        .eq("academicPeriodId", academicPeriodId)
        .eq("gradeCode", gradeCode),
    )) {
    if (classes.has(assignment.classId)) continue;
    const course = await ctx.db.get("classes", assignment.classId);
    if (course?.isActive && getCourseGradeCodes(course).includes(gradeCode))
      classes.set(course._id, course);
  }
  return [...classes.values()];
}

// Maintain the lookup indexes in the same transaction as the course document.
export async function syncCourseGradeAssignments(
  ctx: MutationCtx,
  course: Doc<"classes">,
) {
  const desired = new Map(
    course.gradeAssignments?.map((assignment) => [
      assignment.gradeCode,
      assignment.teacherId ?? course.teacherId,
    ]),
  );
  for await (const row of ctx.db
    .query("classGradeAssignments")
    .withIndex("by_classId_and_gradeCode", (q) =>
      q.eq("classId", course._id),
    )) {
    const teacherId = desired.get(row.gradeCode);
    if (!teacherId) await ctx.db.delete("classGradeAssignments", row._id);
    else {
      if (row.teacherId !== teacherId)
        await ctx.db.patch("classGradeAssignments", row._id, { teacherId });
      desired.delete(row.gradeCode);
    }
  }
  if (!course.campusId || !course.academicPeriodId) return;
  for (const [gradeCode, teacherId] of desired) {
    if (teacherId)
      await ctx.db.insert("classGradeAssignments", {
        classId: course._id,
        campusId: course.campusId,
        academicPeriodId: course.academicPeriodId,
        gradeCode,
        teacherId,
      });
  }
}
