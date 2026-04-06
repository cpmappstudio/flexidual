// lib/rbac.ts

type ClaimsWithMetadata = {
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
} | null | undefined;

export function getRolesFromClaims(claims: ClaimsWithMetadata): Record<string, string> | null {
  if (!claims) return null;
  // Now it checks `metadata` first, which matches your JWT perfectly!
  return claims.metadata?.roles || claims.public_metadata?.roles || claims.publicMetadata?.roles || null;
}

export function isSuperAdmin(claims: ClaimsWithMetadata): boolean {
  const roles = getRolesFromClaims(claims);
  return roles?.system === "superadmin";
}

export function getRoleForOrg(claims: ClaimsWithMetadata, orgSlug: string): string | null {
  const roles = getRolesFromClaims(claims);
  if (!roles) return null;
  // System-level role (superadmin/admin) always takes precedence over org-specific roles.
  // This ensures a superadmin is never misidentified when visiting any org context.
  return roles["system"] ?? roles[orgSlug] ?? null;
}

export function getRoleBasePath(locale: string, orgSlug: string): string {
  return `/${locale}/${orgSlug}`; 
}