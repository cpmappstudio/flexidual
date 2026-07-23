// lib/rbac.ts

type ClaimsWithMetadata =
  | {
      metadata?: {
        roles?: Record<string, string>;
        [key: string]: unknown;
      };
      publicMetadata?: {
        roles?: Record<string, string>;
        [key: string]: unknown;
      };
      public_metadata?: {
        roles?: Record<string, string>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    }
  | null
  | undefined;

export type StaffRole =
  | "superadmin"
  | "admin"
  | "principal"
  | "teacher"
  | "tutor";

const staffRolePriority: StaffRole[] = [
  "superadmin",
  "admin",
  "principal",
  "teacher",
  "tutor",
];

export function getRolesFromClaims(
  claims: ClaimsWithMetadata,
): Record<string, string> | null {
  if (!claims) return null;
  // Now it checks `metadata` first, which matches your JWT perfectly!
  return (
    claims.metadata?.roles ||
    claims.public_metadata?.roles ||
    claims.publicMetadata?.roles ||
    null
  );
}

export function isSuperAdmin(claims: ClaimsWithMetadata): boolean {
  const roles = getRolesFromClaims(claims);
  return roles?.system === "superadmin";
}

export function getRoleForOrg(
  claims: ClaimsWithMetadata,
  orgSlug: string,
): string | null {
  const roles = getRolesFromClaims(claims);
  if (!roles) return null;
  // A system-level superadmin assignment takes precedence over tenant roles.
  return roles["system"] ?? roles[orgSlug] ?? null;
}

export function getHighestStaffRole(
  claims: ClaimsWithMetadata,
): StaffRole | null {
  const roles = getRolesFromClaims(claims);
  if (!roles) return null;
  const assignedRoles = new Set(Object.values(roles));
  return staffRolePriority.find((role) => assignedRoles.has(role)) ?? null;
}

export function hasStaffAccess(claims: ClaimsWithMetadata): boolean {
  return getHighestStaffRole(claims) !== null;
}

export function getRouteRole(
  claims: ClaimsWithMetadata,
  orgSlug: string,
): string | null {
  const orgRole = getRoleForOrg(claims, orgSlug);
  if (orgRole) return orgRole;

  // Institution admins may enter one of their campus URLs even though Clerk's
  // compact role map stores their assignment under the institution slug.
  // Convex remains the source of truth and validates access to that campus.
  return getHighestStaffRole(claims) === "admin" ? "admin" : null;
}
