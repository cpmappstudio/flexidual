"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import {
  getActiveProfileCookieValue,
  getTenantProfileSelectionHref,
  parseActiveProfileCookieValue,
} from "@/lib/tenancy/profile-selection";
import type { TenantProfileSelection } from "@/lib/tenancy/profile-selection-types";

function resolveSelectedOrganizationPersonId(
  selection: TenantProfileSelection,
  cookieValue: string | null,
) {
  if (!selection.requiresSelection) {
    return {
      status: "ready" as const,
      organizationPersonId: null,
    };
  }

  const parsedCookie = parseActiveProfileCookieValue(cookieValue);
  if (
    parsedCookie?.kind === "guardian" &&
    selection.guardian &&
    (!selection.guardian.pinRequired || selection.guardian.pinVerified)
  ) {
    return {
      status: "ready" as const,
      organizationPersonId: null,
    };
  }

  if (
    parsedCookie?.kind === "child" &&
    selection.children.some(
      (child) => child.person._id === parsedCookie.organizationPersonId,
    )
  ) {
    return {
      status: "ready" as const,
      organizationPersonId: parsedCookie.organizationPersonId,
    };
  }

  return {
    status: "missing" as const,
    organizationPersonId: null,
  };
}

function getCurrentSelectionRedirectHref({
  pathname,
  slug,
}: {
  pathname: string | null;
  slug: string;
}) {
  const baseHref = pathname || ROUTES.tenant.root(slug);

  if (typeof window === "undefined") {
    return baseHref;
  }

  return `${baseHref}${window.location.search}${window.location.hash}`;
}

export function useTenantActiveProfileSelection({
  enabled,
  slug,
}: {
  enabled: boolean;
  slug: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const selection = useQuery(
    api.platform.people.getCurrentProfileSelection,
    enabled ? { slug } : "skip",
  ) as TenantProfileSelection | undefined;
  const [cookieValue] = useState(() => getActiveProfileCookieValue());

  useEffect(() => {
    if (!enabled || !selection) {
      return;
    }

    const selectedProfile = resolveSelectedOrganizationPersonId(
      selection,
      cookieValue,
    );
    if (selectedProfile.status === "missing") {
      router.replace(
        getTenantProfileSelectionHref(
          getCurrentSelectionRedirectHref({ pathname, slug }),
        ),
      );
    }
  }, [cookieValue, enabled, pathname, router, selection, slug]);

  if (!enabled) {
    return {
      isReady: true,
      organizationPersonId: null,
    };
  }

  if (!selection) {
    return {
      isReady: false,
      organizationPersonId: null,
    };
  }

  const selectedProfile = resolveSelectedOrganizationPersonId(
    selection,
    cookieValue,
  );

  return {
    isReady: selectedProfile.status === "ready",
    organizationPersonId: selectedProfile.organizationPersonId,
  };
}
