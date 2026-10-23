import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessClass, hasSystemRole } from "../permissions";
import { getCurrentUserFromAuth } from "../users";
import {
  getSoleStudentCampusId,
  getStudentGradeCode,
  getStudentSchoolIds,
  resolveMembershipSchoolId,
} from "./membership";
import { hasOnlyInstructorStaffRoles, isStaffRole } from "./roles";
import {
  canStaffAccessLiveClass,
  canStudentAccessLiveClass,
} from "./liveAccess";
import { isStudentEnrolled, listActiveStudentClasses } from "./enrollments";
import {
  getCourseGradeCodes,
  isCourseTeacher,
  listTeacherClasses,
} from "./courseAssignments";

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

type ScheduleAccessCtx = QueryCtx | MutationCtx;

export async function canAccessInstitutionalSchedule(
  ctx: ScheduleAccessCtx,
  userId: Id<"users">,
  schedule: Doc<"classSchedule">,
  classData: Doc<"classes">,
) {
  const [curriculum, campus, studentSchoolIds, isEnrolled] = await Promise.all([
    ctx.db.get(classData.curriculumId),
    classData.campusId ? ctx.db.get(classData.campusId) : null,
    getStudentSchoolIds(ctx, userId),
    isStudentEnrolled(ctx, classData, userId),
  ]);
  const classSchoolId = campus?.schoolId ?? curriculum?.schoolId;
  if (classSchoolId && canStaffAccessLiveClass(schedule.liveAccess, true)) {
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const assignment of assignments) {
      if (!isStaffRole(assignment.role)) continue;
      const schoolId =
        assignment.schoolId ??
        (await resolveMembershipSchoolId(
          ctx,
          assignment.orgType,
          assignment.orgId,
        ));
      if (schoolId === classSchoolId) return true;
    }
  }
  const studentGrade = classSchoolId
    ? await getStudentGradeCode(ctx, userId, classSchoolId, classData.campusId)
    : undefined;

  return canStudentAccessLiveClass({
    isEnrolled,
    liveAccess: schedule.liveAccess,
    studentGrade,
    classSchoolId,
    studentSchoolIds,
  });
}

export async function canAccessSchedule(
  ctx: ScheduleAccessCtx,
  userId: Id<"users">,
  schedule: Doc<"classSchedule">,
) {
  const classData = await ctx.db.get(schedule.classId);
  if (!classData) return false;
  if (await canAccessClass(ctx, userId, classData)) return true;
  return await canAccessInstitutionalSchedule(ctx, userId, schedule, classData);
}

function matchesScope(
  classData: Doc<"classes">,
  scope: Pick<ScheduleClassScope, "teacherId" | "gradeCode">,
) {
  return (
    (!scope.teacherId || isCourseTeacher(classData, scope.teacherId)) &&
    (!scope.gradeCode ||
      getCourseGradeCodes(classData).includes(scope.gradeCode))
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
      listTeacherClasses(ctx, user._id),
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
        ? await listTeacherClasses(ctx, scope.teacherId)
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
    const teachingClasses = await listTeacherClasses(ctx, user._id);
    const campusId = studentCampusId ?? scope.campusId;
    const enrolledClasses = await listActiveStudentClasses(
      ctx,
      user._id,
      campusId,
    );
    const combined = [...teachingClasses, ...enrolledClasses].filter(
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
