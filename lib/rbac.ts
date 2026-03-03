// lib/rbac.ts

type ClaimsWithMetadata = {
  metadata?: {
    roles?: Record<string, string>;
    [key: string]: any;
  };
  publicMetadata?: {
    roles?: Record<string, string>;
    [key: string]: any;
  };
  public_metadata?: {
    roles?: Record<string, string>;
    [key: string]: any;
  };
  [key: string]: any;
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
  return roles?.[orgSlug] || null;
}

export function getRoleBasePath(locale: string, orgSlug: string, role: string): string {
  return `/${locale}/${orgSlug}`; 
}