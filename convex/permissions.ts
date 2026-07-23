import { MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { resolveMembershipSchoolId } from "./model/membership";
import { isStudentEnrolled } from "./model/enrollments";
import type { UserRole } from "./model/roles";

const STAFF_ROLES: UserRole[] = [
  "superadmin",
  "admin",
  "principal",
  "teacher",
  "tutor",
];

/**
 * Checks if a user has a specific system-wide role (like superadmin or global admin)
 */
export async function hasSystemRole(
  ctx: QueryCtx,
  userId: Id<"users">,
  allowedRoles: string[],
): Promise<boolean> {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", undefined).eq("orgType", "system"),
    )
    .collect();

  return assignments.some((a) => allowedRoles.includes(a.role));
}

/**
 * Checks if a user has a specific role within a specific organization context (School or Campus).
 * Note: System Superadmins automatically pass this check.
 */
export async function hasOrgRole(
  ctx: QueryCtx,
  userId: Id<"users">,
  orgId: string, // Can be schoolId or campusId
  orgType: "school" | "campus",
  allowedRoles: string[],
): Promise<boolean> {
  // 1. Check if they are a system superadmin (override)
  const isSuperAdmin = await hasSystemRole(ctx, userId, ["superadmin"]);
  if (isSuperAdmin) return true;

  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user_org", (q) =>
      q.eq("userId", userId).eq("orgId", orgId).eq("orgType", orgType),
    )
    .collect();

  return assignments.some((a) => allowedRoles.includes(a.role));
}

export function canManageInstitution(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
) {
  return hasOrgRole(ctx, userId, schoolId, "school", ["admin"]);
}

export async function hasStaffAccess(
  ctx: QueryCtx,
  userId: Id<"users">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return assignments.some((assignment) =>
    STAFF_ROLES.includes(assignment.role),
  );
}

export async function canViewInstitutionSettings(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
) {
  if (await canManageInstitution(ctx, userId, schoolId)) return true;
  return await isPrincipalOfSchool(ctx, userId, schoolId);
}

export async function canViewCampusOperations(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  campusId: Id<"campuses">,
  schoolId: Id<"schools">,
) {
  if (await hasOrgRole(ctx, userId, schoolId, "school", ["admin"])) {
    return true;
  }
  return await hasOrgRole(ctx, userId, campusId, "campus", [
    "principal",
    "teacher",
    "tutor",
  ]);
}

export async function canAccessSchool(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
) {
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const assignment of assignments) {
    const assignmentSchoolId =
      assignment.schoolId ??
      (await resolveMembershipSchoolId(
        ctx,
        assignment.orgType,
        assignment.orgId,
      ));
    if (assignmentSchoolId === schoolId) return true;
  }
  return false;
}

export async function canAccessCampus(
  ctx: QueryCtx,
  userId: Id<"users">,
  campusId: Id<"campuses">,
  schoolId: Id<"schools">,
) {
  if (await hasOrgRole(ctx, userId, schoolId, "school", ["admin"])) {
    return true;
  }
  return await hasOrgRole(ctx, userId, campusId, "campus", [
    "principal",
    "teacher",
    "tutor",
    "student",
  ]);
}

export async function canModifyCurriculumContent(
  ctx: QueryCtx,
  userId: Id<"users">,
  curriculumId: Id<"curriculums">,
): Promise<boolean> {
  const curriculum = await ctx.db.get(curriculumId);
  if (!curriculum) return false;

  // 1. Superadmins can do anything
  const isSuperAdmin = await hasSystemRole(ctx, userId, ["superadmin"]);
  if (isSuperAdmin) return true;

  // If curriculum has no school, only superadmins can touch it
  if (!curriculum.schoolId) return false;

  // Institution-wide curriculum content is managed only by institution admins.
  const isSchoolAdmin = await hasOrgRole(
    ctx,
    userId,
    curriculum.schoolId,
    "school",
    ["admin"],
  );
  if (isSchoolAdmin) return true;
  return false;
}

export async function canAccessCurriculumContent(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  curriculumId: Id<"curriculums">,
): Promise<boolean> {
  const curriculum = await ctx.db.get(curriculumId);
  if (!curriculum) return false;
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;
  if (
    curriculum.schoolId &&
    (await canManageCurriculums(ctx, userId, curriculum.schoolId))
  ) {
    return true;
  }

  const classes = await ctx.db
    .query("classes")
    .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculumId))
    .collect();
  for (const classData of classes) {
    const campus = classData.campusId
      ? await ctx.db.get(classData.campusId)
      : null;
    if (
      classData.isActive &&
      (classData.teacherId === userId ||
        classData.tutorId === userId ||
        (await isStudentEnrolled(ctx, classData, userId)) ||
        (classData.campusId &&
          campus &&
          (await canViewCampusOperations(
            ctx,
            userId,
            classData.campusId,
            campus.schoolId,
          ))))
    ) {
      return true;
    }
  }
  return false;
}

export async function canManageClasses(
  ctx: QueryCtx,
  userId: Id<"users">,
  campusId?: Id<"campuses">,
  schoolId?: Id<"schools">,
): Promise<boolean> {
  // 1. Superadmin override
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;

  // 2. Campus Admin/Principal check
  if (
    campusId &&
    (await hasOrgRole(ctx, userId, campusId, "campus", ["admin", "principal"]))
  )
    return true;

  // 3. School Admin check (School Admins can manage classes in any of their campuses)
  if (
    schoolId &&
    (await hasOrgRole(ctx, userId, schoolId, "school", ["admin"]))
  )
    return true;

  return false;
}

export async function canAccessClass(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  classData: Doc<"classes">,
): Promise<boolean> {
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;
  if (
    classData.teacherId === userId ||
    classData.tutorId === userId ||
    (await isStudentEnrolled(ctx, classData, userId))
  ) {
    return true;
  }

  const [campus, curriculum] = await Promise.all([
    classData.campusId ? ctx.db.get(classData.campusId) : null,
    ctx.db.get(classData.curriculumId),
  ]);

  // Campus membership alone does not grant access to every course. Teachers
  // and tutors pass only through the direct assignments above; principals and
  // institution admins pass through canManageClasses.
  return await canManageClasses(
    ctx,
    userId,
    classData.campusId,
    campus?.schoolId ?? curriculum?.schoolId,
  );
}

export async function canManageRoom(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  roomName: string,
): Promise<boolean> {
  const schedule = await ctx.db
    .query("classSchedule")
    .withIndex("by_room", (q) => q.eq("roomName", roomName))
    .first();
  if (!schedule) return false;

  const classData = await ctx.db.get(schedule.classId);
  if (!classData) return false;
  if (classData.teacherId === userId || classData.tutorId === userId) {
    return true;
  }

  const [campus, curriculum] = await Promise.all([
    classData.campusId ? ctx.db.get(classData.campusId) : null,
    ctx.db.get(classData.curriculumId),
  ]);
  return await canManageClasses(
    ctx,
    userId,
    classData.campusId,
    campus?.schoolId ?? curriculum?.schoolId,
  );
}

export async function canManageCurriculums(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId?: Id<"schools">,
): Promise<boolean> {
  // 1. Superadmin override
  if (await hasSystemRole(ctx, userId, ["superadmin"])) return true;

  // 2. Institution administrators manage the shared curriculum catalog.
  if (schoolId) {
    if (await hasOrgRole(ctx, userId, schoolId, "school", ["admin"]))
      return true;
  }

  return false;
}

export async function isPrincipalOfSchool(
  ctx: QueryCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
): Promise<boolean> {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const principalAssignments = assignments.filter(
    (assignment) =>
      assignment.role === "principal" && assignment.orgType === "campus",
  );

  if (principalAssignments.length === 0) return false;

  // Resolve the campuses to find their parent schoolId
  const campuses = await Promise.all(
    principalAssignments.map((a) => ctx.db.get(a.orgId as Id<"campuses">)),
  );

  return campuses.some((c) => c?.schoolId === schoolId);
}
