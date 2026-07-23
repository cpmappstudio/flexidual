import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { SignInAccessDenied } from "@/components/auth/sign-in-access-denied";
import SignInForm from "@/components/auth/sign-in-form";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { api } from "@/convex/_generated/api";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { TenantParams } from "@/i18n/params";
import { getCurrentConvexAuthState } from "@/lib/auth/server";
import { getImageFallbackLabel } from "@/lib/files/image";
import { ROUTES } from "@/lib/navigation/routes";
import { getSafeRedirectHref } from "@/lib/navigation/utils";
import { getOrganizationBySlug } from "@/lib/organizations/server";
import { getTenantProfileSelectionHref } from "@/lib/tenancy/profile-selection";

export async function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  const translationsPromise = getTranslations({
    locale,
    namespace: "Metadata",
  });
  const organization = await getOrganizationBySlug(tenant);
  const t = await translationsPromise;

  if (!organization) {
    return {
      title: t("pages.signIn"),
    };
  }

  return {
    title: {
      absolute: `${organization.name} | ${t("pages.signIn")}`,
    },
  };
}

export default async function TenantSignInPage({
  params,
  searchParams,
}: {
  params: TenantParams;
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const organization = await getOrganizationBySlug(tenant);

  if (!organization) {
    notFound();
  }

  const [t, { redirectTo }, { currentUser, token }] = await Promise.all([
    getTranslations("Common"),
    searchParams,
    getCurrentConvexAuthState(),
  ]);

  const safeRedirectHref = getSafeRedirectHref(
    typeof redirectTo === "string" ? redirectTo : undefined,
    ROUTES.tenant.root(tenant),
  );
  const targetRedirectHref =
    safeRedirectHref === ROUTES.home
      ? ROUTES.tenant.root(tenant)
      : safeRedirectHref;
  const redirectHref = getTenantProfileSelectionHref(targetRedirectHref);

  if (currentUser && token) {
    const canAccessTenant = await fetchQuery(
      api.users.canUseTenantSignIn,
      { slug: tenant },
      { token },
    );

    if (canAccessTenant) {
      return redirect({ href: redirectHref, locale });
    }

    return (
      <AuthPageShell appName={t("appName")}>
        <IntlMessagesProvider namespaces={["SignIn"]}>
          <SignInAccessDenied signInHref={ROUTES.tenant.auth.signIn(tenant)} />
        </IntlMessagesProvider>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell appName={t("appName")}>
      <IntlMessagesProvider namespaces={["SignIn"]}>
        <SignInForm
          redirectHref={redirectHref}
          branding={{
            name: organization.name,
            imageUrl: organization.imageUrl ?? null,
            imageAlt: organization.name,
            imageFallback: getImageFallbackLabel({
              name: organization.name,
              fallback: "IN",
            }),
          }}
        />
      </IntlMessagesProvider>
    </AuthPageShell>
  );
}
