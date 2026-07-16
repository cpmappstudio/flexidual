export type AppRole = "admin" | "member";

interface SessionMetadata {
  role?: unknown;
  isSuperAdmin?: unknown;
}

function getSessionMetadata(sessionClaims: unknown): SessionMetadata | null {
  if (!sessionClaims || typeof sessionClaims !== "object") {
    return null;
  }

  const metadata = (sessionClaims as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return metadata as SessionMetadata;
}

export function getAppRoleFromSessionClaims(
  sessionClaims: unknown,
): AppRole | null {
  const metadata = getSessionMetadata(sessionClaims);
  const role = metadata?.role;
  return role === "admin" || role === "member" ? role : null;
}

export function isSuperAdminFromSessionClaims(sessionClaims: unknown): boolean {
  const metadata = getSessionMetadata(sessionClaims);
  return metadata?.isSuperAdmin === true;
}

export function isAdminFromSessionClaims(sessionClaims: unknown): boolean {
  return (
    isSuperAdminFromSessionClaims(sessionClaims) ||
    getAppRoleFromSessionClaims(sessionClaims) === "admin"
  );
}

export function hasSingleTenantAccessFromSessionClaims(
  sessionClaims: unknown,
): boolean {
  return (
    isSuperAdminFromSessionClaims(sessionClaims) ||
    getAppRoleFromSessionClaims(sessionClaims) !== null
  );
}
