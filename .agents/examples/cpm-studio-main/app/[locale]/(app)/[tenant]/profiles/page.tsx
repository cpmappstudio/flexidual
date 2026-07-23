import { fetchMutation, fetchQuery } from "convex/nextjs";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { TenantProfileSelector } from "@/components/tenant/tenant-profile-selector";
import { api } from "@/convex/_generated/api";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { TenantParams } from "@/i18n/params";
import { getSafeRedirectHref } from "@/lib/navigation/utils";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantShellState } from "@/lib/tenancy/shell.server";
import { isTenantOnboardingRequired } from "@/lib/tenancy/services";
import { canManageTenantWorkspace } from "@/lib/tenancy/workspace.server";
import type { TenantProfileSelection } from "@/lib/tenancy/profile-selection-types";

export async function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.profileSelection"),
  };
}

export default async function TenantProfilesPage({
  params,
  searchParams,
}: {
  params: TenantParams;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const { token, currentUser, access } = await getTenantShellState(tenant);

  if (!token || !currentUser || !access) {
    return redirect({
      href: ROUTES.tenant.auth.signIn(tenant),
      locale,
    });
  }

  if (
    canManageTenantWorkspace(access) &&
    isTenantOnboardingRequired(access.enabledCapabilityKeys)
  ) {
    return redirect({
      href: ROUTES.tenant.onboarding(tenant),
      locale,
    });
  }

  const { next } = await searchParams;
  const fallbackHref = ROUTES.tenant.root(tenant);
  const requestedNextHref = getSafeRedirectHref(
    typeof next === "string" ? next : undefined,
    fallbackHref,
  );
  const nextHref = requestedNextHref.startsWith(ROUTES.tenant.profiles(tenant))
    ? fallbackHref
    : requestedNextHref;
  await fetchMutation(
    api.platform.people.lockCurrentGuardianProfile,
    { slug: tenant },
    { token },
  );
  const selection = (await fetchQuery(
    api.platform.people.getCurrentProfileSelection,
    { slug: tenant },
    { token },
  )) as TenantProfileSelection;

  if (!selection.requiresSelection) {
    return redirect({
      href: nextHref,
      locale,
    });
  }

  return (
    <IntlMessagesProvider namespaces={["TenantProfileSelection"]}>
      <TenantProfileSelector
        nextHref={nextHref}
        slug={tenant}
        organization={{
          name: access.organization.name,
          imageUrl: access.organization.imageUrl ?? null,
        }}
        selection={selection}
      />
    </IntlMessagesProvider>
  );
}
