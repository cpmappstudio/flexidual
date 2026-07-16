const FALLBACK_TENANT_SLUG = "cpca-sports";

export type TenancyMode = "multi" | "single";

function parseTenancyMode(value: string | undefined): TenancyMode {
  return value === "single" ? "single" : "multi";
}

function parseDefaultTenantSlug(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0
    ? normalized
    : FALLBACK_TENANT_SLUG;
}

const rawTenancyMode =
  process.env.TENANCY_MODE ?? process.env.NEXT_PUBLIC_TENANCY_MODE;
const rawDefaultTenantSlug =
  process.env.DEFAULT_TENANT_SLUG ??
  process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG;

export const TENANCY_MODE = parseTenancyMode(rawTenancyMode);
export const DEFAULT_TENANT_SLUG = parseDefaultTenantSlug(
  rawDefaultTenantSlug,
);

export function isSingleTenantMode(): boolean {
  return TENANCY_MODE === "single";
}

export function isMultiTenantMode(): boolean {
  return TENANCY_MODE === "multi";
}
