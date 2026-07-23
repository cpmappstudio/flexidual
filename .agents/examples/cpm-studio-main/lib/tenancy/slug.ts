import { ROUTES } from "../navigation/routes";

const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getLeadingSegment(pathname: string) {
  return pathname.split("/").filter(Boolean)[0] ?? null;
}

function collectStaticRouteLeadingSegments(value: unknown): string[] {
  if (typeof value === "string") {
    const segment = getLeadingSegment(value);
    return segment ? [segment] : [];
  }

  if (typeof value === "function" || !value || typeof value !== "object") {
    return [];
  }

  return Object.values(value).flatMap(collectStaticRouteLeadingSegments);
}

const PRODUCT_RESERVED_TENANT_SEGMENTS =
  collectStaticRouteLeadingSegments(ROUTES);

const INFRA_RESERVED_TENANT_SEGMENTS = [
  "api",
  "trpc",
  "_next",
  "_vercel",
];

export const RESERVED_TENANT_SEGMENTS = new Set(
  [
    ...PRODUCT_RESERVED_TENANT_SEGMENTS,
    ...INFRA_RESERVED_TENANT_SEGMENTS,
  ].filter((segment): segment is string => !!segment),
);

export function normalizeTenantSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedTenantSlug(slug: string) {
  return RESERVED_TENANT_SEGMENTS.has(slug);
}

export function isTenantSlug(slug: string) {
  return TENANT_SLUG_PATTERN.test(slug) && !isReservedTenantSlug(slug);
}

export function parseTenantSlug(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const slug = normalizeTenantSlug(value);
  return isTenantSlug(slug) ? slug : null;
}
