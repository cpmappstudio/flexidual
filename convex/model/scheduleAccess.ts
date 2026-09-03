import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { canAccessClass, hasSystemRole } from "../permissions";
import { getCurrentUserFromAuth } from "../users";
import { getSoleStudentCampusId } from "./membership";
import { hasOnlyInstructorStaffRoles } from "./roles";

export type ScheduleClassScope = {
  schoolId?: Id<"schools">;
  campusId?: Id<"campuses">;
  classId?: Id<"classes">;
  teacherId?: Id<"users">;
  gradeCode?: string;
};

type AccessibleScheduleClasses = {
  user: Doc<"users">;
  classes: Doc<"classes">[];
  isStaffViewer: boolean;
};

function matchesScope(
  classData: Doc<"classes">,
  scope: Pick<ScheduleClassScope, "teacherId" | "gradeCode">,
) {
  return (
    (!scope.teacherId || classData.teacherId === scope.teacherId) &&
    (!scope.gradeCode || classData.gradeCode === scope.gradeCode)
  );
}

export async function listAccessibleScheduleClasses(
  ctx: QueryCtx,
  scope: ScheduleClassScope,
): Promise<AccessibleScheduleClasses | null> {
  const user = await getCurrentUserFromAuth(ctx);
  if (!user) return null;

  const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);
  const userAssignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const staffAssignments = userAssignments.filter(
    (assignment) =>
      assignment.role === "admin" ||
      assignment.role === "principal" ||
      assignment.role === "teacher" ||
      assignment.role === "tutor",
  );
  const isStaffViewer = isSuperAdmin || staffAssignments.length > 0;
  const instructorOnly =
    !isSuperAdmin &&
    hasOnlyInstructorStaffRoles(
      staffAssignments.map((assignment) => assignment.role),
    );
  const staffSchoolIds = staffAssignments.flatMap((assignment) =>
    assignment.orgType === "school" && assignment.orgId
      ? [assignment.orgId]
      : [],
  );
  const staffCampusIds = staffAssignments.flatMap((assignment) =>
    assignment.orgType === "campus" && assignment.orgId
      ? [assignment.orgId]
      : [],
  );

  let classes: Doc<"classes">[] = [];

  if (scope.classId) {
    const classData = await ctx.db.get(scope.classId);
    if (
      classData?.isActive &&
      matchesScope(classData, scope) &&
      (await canAccessClass(ctx, user._id, classData))
    ) {
      classes = [classData];
    }
  } else if (instructorOnly) {
    const [teachingClasses, tutoringClasses] = await Promise.all([
      ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) =>
          q.eq("teacherId", user._id).eq("isActive", true),
        )
        .collect(),
      ctx.db
        .query("classes")
        .withIndex("by_tutor", (q) =>
          q.eq("tutorId", user._id).eq("isActive", true),
        )
        .collect(),
    ]);
    const requestedCampusIds = scope.schoolId
      ? new Set(
          (
            await ctx.db
              .query("campuses")
              .withIndex("by_school", (q) => q.eq("schoolId", scope.schoolId!))
              .collect()
          ).map((campus) => campus._id),
        )
      : null;
    classes = [
      ...new Map(
        [...teachingClasses, ...tutoringClasses].map((classData) => [
          classData._id,
          classData,
        ]),
      ).values(),
    ].filter(
      (classData) =>
        (!scope.campusId || classData.campusId === scope.campusId) &&
        (!requestedCampusIds ||
          (classData.campusId && requestedCampusIds.has(classData.campusId))) &&
        matchesScope(classData, scope),
    );
  } else if (isStaffViewer) {
    if (isSuperAdmin && !scope.schoolId && !scope.campusId) {
      const candidates = scope.teacherId
        ? await ctx.db
            .query("classes")
            .withIndex("by_teacher", (q) =>
              q.eq("teacherId", scope.teacherId).eq("isActive", true),
            )
            .collect()
        : await ctx.db
            .query("classes")
            .withIndex("by_active", (q) => q.eq("isActive", true))
            .collect();
      classes = candidates.filter((classData) =>
        matchesScope(classData, scope),
      );
    } else {
      const requestedSchoolIds = scope.campusId
        ? []
        : scope.schoolId
          ? [scope.schoolId]
          : staffSchoolIds
              .map((id) => ctx.db.normalizeId("schools", id))
              .filter((id): id is Id<"schools"> => id !== null);
      const schoolCampuses = (
        await Promise.all(
          requestedSchoolIds.map((schoolId) =>
            ctx.db
              .query("campuses")
              .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
              .collect(),
          ),
        )
      ).flat();
      const requestedCampusIds = scope.campusId
        ? [scope.campusId]
        : scope.schoolId
          ? schoolCampuses.map((campus) => campus._id)
          : [
              ...staffCampusIds
                .map((id) => ctx.db.normalizeId("campuses", id))
                .filter((id): id is Id<"campuses"> => id !== null),
              ...schoolCampuses.map((campus) => campus._id),
            ];
      const [campusClasses, schoolCurriculums] = await Promise.all([
        Promise.all(
          [...new Set(requestedCampusIds)].map((campusId) =>
            ctx.db
              .query("classes")
              .withIndex("by_campus", (q) =>
                q.eq("campusId", campusId).eq("isActive", true),
              )
              .collect(),
          ),
        ),
        Promise.all(
          requestedSchoolIds.map((schoolId) =>
            ctx.db
              .query("curriculums")
              .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
              .collect(),
          ),
        ),
      ]);
      const legacySchoolClasses = await Promise.all(
        schoolCurriculums.flat().map((curriculum) =>
          ctx.db
            .query("classes")
            .withIndex("by_curriculum", (q) =>
              q.eq("curriculumId", curriculum._id),
            )
            .collect(),
        ),
      );
      const accessible = new Map(
        [...campusClasses.flat(), ...legacySchoolClasses.flat()]
          .filter(
            (classData) => classData.isActive && matchesScope(classData, scope),
          )
          .map((classData) => [classData._id, classData]),
      );
      const access = await Promise.all(
        [...accessible.values()].map((classData) =>
          canAccessClass(ctx, user._id, classData),
        ),
      );
      classes = [...accessible.values()].filter((_, index) => access[index]);
    }
  } else {
    const studentCampusId = await getSoleStudentCampusId(ctx, user._id);
    if (
      studentCampusId &&
      scope.campusId &&
      studentCampusId !== scope.campusId
    ) {
      return { user, classes: [], isStaffViewer };
    }
    const teachingClasses = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) =>
        q.eq("teacherId", user._id).eq("isActive", true),
      )
      .collect();
    const enrollmentRows = await ctx.db
      .query("classEnrollments")
      .withIndex("by_student", (q) => q.eq("studentId", user._id))
      .collect();
    const enrolledClasses = (
      await Promise.all(enrollmentRows.map((row) => ctx.db.get(row.classId)))
    ).filter((classData): classData is Doc<"classes"> =>
      Boolean(classData?.isActive),
    );
    // Remove this fallback after class enrollment rows are backfilled everywhere.
    const legacyClasses = (
      await ctx.db
        .query("classes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect()
    ).filter(
      (classData) =>
        !classData.enrollmentsMigratedAt &&
        classData.students?.includes(user._id),
    );
    const campusId = studentCampusId ?? scope.campusId;
    const combined = [
      ...teachingClasses,
      ...enrolledClasses,
      ...legacyClasses,
    ].filter(
      (classData) =>
        (!campusId || classData.campusId === campusId) &&
        matchesScope(classData, scope),
    );
    classes = [
      ...new Map(
        combined.map((classData) => [classData._id, classData]),
      ).values(),
    ];
  }

  return { user, classes, isStaffViewer };
}
