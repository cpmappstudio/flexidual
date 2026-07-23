import { redirect as nextRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthenticatedSiteHeader } from "@/components/authenticated-site-header";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { TenantOnboardingLayoutBreadcrumb } from "@/components/tenant/tenant-onboarding-layout-breadcrumb";
import { TenantOnboardingProvider } from "@/components/tenant/tenant-onboarding-provider";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { TenantParams } from "@/i18n/params";
import { ROUTES } from "@/lib/navigation/routes";
import { getRootHostUrl } from "@/lib/tenancy/domain";
import { getTenantOnboardingState } from "@/lib/tenancy/onboarding.server";
import { isTenantOnboardingRequired } from "@/lib/tenancy/services";

export default async function TenantOnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const {
    currentUser,
    token,
    preloadedCurrentUser,
    access,
    initialSelectedServices,
  } =
    await getTenantOnboardingState(tenant);
  if (!token) {
    return redirect({ href: ROUTES.tenant.auth.signIn(tenant), locale });
  }

  if (!currentUser || !preloadedCurrentUser) {
    return redirect({ href: ROUTES.tenant.auth.signIn(tenant), locale });
  }

  if (!access) {
    nextRedirect(getRootHostUrl(locale));
  }

  if (!isTenantOnboardingRequired(access.enabledCapabilityKeys)) {
    return redirect({
      href: ROUTES.tenant.root(tenant),
      locale,
    });
  }

  return (
    <IntlMessagesProvider namespaces={["TenantOnboarding", "PlatformTeam"]}>
      <AuthenticatedSiteHeader
        logoHref={
          access.isPlatformAdmin
            ? getRootHostUrl(locale, ROUTES.institutions.root)
            : ROUTES.tenant.root(tenant)
        }
        preloadedCurrentUser={preloadedCurrentUser}
        signOutRedirectHref={ROUTES.auth.signIn}
      />

      <TenantOnboardingProvider initialSelectedServices={initialSelectedServices}>
        <div className="px-4 py-10">
          <div className="mx-auto w-full max-w-6xl">
            <TenantOnboardingLayoutBreadcrumb />
            {children}
          </div>
        </div>
      </TenantOnboardingProvider>
    </IntlMessagesProvider>
  );
}
