import type { Id } from "@/convex/_generated/dataModel";
import { ROUTES } from "@/lib/navigation/routes";

export const TENANT_ACTIVE_PROFILE_COOKIE_NAME = "tenant_active_profile";
export const TENANT_ACTIVE_PROFILE_GUARDIAN_VALUE = "guardian";
export const TENANT_PROFILE_SELECTION_NEXT_PARAM = "next";

const CHILD_PROFILE_PREFIX = "child:";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export function getTenantProfileSelectionHref(nextHref: string) {
  const params = new URLSearchParams({
    [TENANT_PROFILE_SELECTION_NEXT_PARAM]: nextHref,
  });

  return `${ROUTES.tenant.profiles()}?${params.toString()}`;
}

export function getGuardianProfileCookieValue() {
  return TENANT_ACTIVE_PROFILE_GUARDIAN_VALUE;
}

export function getChildProfileCookieValue(
  organizationPersonId: Id<"organizationPeople">,
) {
  return `${CHILD_PROFILE_PREFIX}${organizationPersonId}`;
}

export function parseActiveProfileCookieValue(value: string | null | undefined) {
  if (value === TENANT_ACTIVE_PROFILE_GUARDIAN_VALUE) {
    return {
      kind: "guardian" as const,
      organizationPersonId: null,
    };
  }

  if (value?.startsWith(CHILD_PROFILE_PREFIX)) {
    const organizationPersonId = value.slice(CHILD_PROFILE_PREFIX.length);

    if (organizationPersonId) {
      return {
        kind: "child" as const,
        organizationPersonId: organizationPersonId as Id<"organizationPeople">,
      };
    }
  }

  return null;
}

export function getActiveProfileCookieValue() {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((entry) =>
      entry.startsWith(`${TENANT_ACTIVE_PROFILE_COOKIE_NAME}=`),
    );

  return cookie
    ? decodeURIComponent(cookie.split("=").slice(1).join("="))
    : null;
}

export function setActiveProfileCookieValue(value: string) {
  const cookieParts = [
    `${TENANT_ACTIVE_PROFILE_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "path=/",
    "SameSite=Lax",
  ];

  if (value !== TENANT_ACTIVE_PROFILE_GUARDIAN_VALUE) {
    cookieParts.push(`max-age=${ONE_YEAR_IN_SECONDS}`);
  }

  document.cookie = cookieParts.join("; ");
}

export function clearActiveProfileCookieValue() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = [
    `${TENANT_ACTIVE_PROFILE_COOKIE_NAME}=`,
    "path=/",
    "max-age=0",
    "SameSite=Lax",
  ].join("; ");
}
