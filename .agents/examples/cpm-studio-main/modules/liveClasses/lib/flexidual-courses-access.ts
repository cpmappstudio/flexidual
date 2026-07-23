import type { TenantEffectiveRole } from "@/lib/modules/types";

export type FlexidualCoursesViewRole = "admin" | "teacher";

export type FlexidualCoursesPermissions = {
  canCreateCourse: boolean;
};

export function getFlexidualCoursesViewRole(args: {
  effectiveRole: TenantEffectiveRole;
  isPlatformAdmin: boolean;
}): FlexidualCoursesViewRole {
  return args.isPlatformAdmin ||
    args.effectiveRole === "owner" ||
    args.effectiveRole === "admin"
    ? "admin"
    : "teacher";
}

export function getFlexidualCoursesPermissions(
  role: FlexidualCoursesViewRole,
): FlexidualCoursesPermissions {
  return {
    canCreateCourse: role === "admin",
  };
}
