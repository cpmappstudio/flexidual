import { v } from "convex/values";

export type UserRole =
  | "superadmin"
  | "admin"
  | "principal"
  | "teacher"
  | "tutor"
  | "student";

export type OrganizationType = "system" | "school" | "campus";

type RoleAssignmentScope = {
  role: UserRole;
  orgType: OrganizationType;
  orgId?: string;
};

const STAFF_ROLES = new Set<UserRole>([
  "superadmin",
  "admin",
  "principal",
  "teacher",
  "tutor",
]);

const COURSE_MANAGER_ROLES = new Set<UserRole>([
  "superadmin",
  "admin",
  "principal",
]);

const COURSE_INSTRUCTOR_ROLES = new Set<UserRole>(["teacher", "tutor"]);

export const roleValidator = v.union(
  v.literal("superadmin"),
  v.literal("admin"),
  v.literal("principal"),
  v.literal("teacher"),
  v.literal("tutor"),
  v.literal("student"),
);

export function isRoleValidForOrganization(
  role: UserRole,
  orgType: OrganizationType,
) {
  if (role === "superadmin") return orgType === "system";
  if (role === "admin") return orgType === "school";
  return orgType === "campus";
}

export function canRoleManageCourses(role: UserRole) {
  return COURSE_MANAGER_ROLES.has(role);
}

export function isStaffRole(role: UserRole) {
  return STAFF_ROLES.has(role);
}

export function hasOnlyInstructorStaffRoles(roles: UserRole[]) {
  return (
    roles.some((role) => COURSE_INSTRUCTOR_ROLES.has(role)) &&
    !roles.some((role) => COURSE_MANAGER_ROLES.has(role))
  );
}

export function canAssignmentsManageClass(
  assignments: RoleAssignmentScope[],
  campusId?: string,
  schoolId?: string,
) {
  return assignments.some(
    (assignment) =>
      (assignment.role === "superadmin" && assignment.orgType === "system") ||
      (schoolId !== undefined &&
        assignment.role === "admin" &&
        assignment.orgType === "school" &&
        assignment.orgId === schoolId) ||
      (campusId !== undefined &&
        (assignment.role === "admin" || assignment.role === "principal") &&
        assignment.orgType === "campus" &&
        assignment.orgId === campusId),
  );
}
