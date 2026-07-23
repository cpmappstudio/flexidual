import "server-only";

import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthenticatedSiteHeader } from "@/components/authenticated-site-header";
import { ChangelogPage } from "@/components/changelog/changelog-page";
import { api } from "@/convex/_generated/api";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { LocaleParams, TenantParams } from "@/i18n/params";
import { getConvexAuthToken } from "@/lib/auth/server";
import { getGitHubChangelogVersions } from "@/lib/changelog/github.server";
import { ROUTES } from "@/lib/navigation/routes";
import { renderTenantShellLayout } from "@/lib/tenancy/shell-layout";

type ChangelogParams = LocaleParams | TenantParams;

export async function generateChangelogMetadata({
  params,
}: {
  params: ChangelogParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.changelog"),
  };
}

export async function renderTenantChangelogPage({
  params,
}: {
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const versions = await getGitHubChangelogVersions();

  return renderTenantShellLayout({
    tenantSlug: tenant,
    locale,
    contentClassName: "",
    children: <ChangelogPage locale={locale} versions={versions} />,
  });
}

export async function renderGlobalChangelogPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const token = await getConvexAuthToken();
  if (!token) {
    return redirect({ href: ROUTES.auth.signIn, locale });
  }

  const preloadedCurrentUser = await preloadQuery(
    api.users.current,
    {},
    { token },
  );
  const currentUser = preloadedQueryResult(preloadedCurrentUser);

  if (!currentUser) {
    return redirect({ href: ROUTES.auth.signIn, locale });
  }

  const t = await getTranslations("Common");
  const platformNavigation = currentUser.platformRole
    ? [
        { label: t("institutions"), href: ROUTES.institutions.root },
        { label: t("teamSettings"), href: ROUTES.institutions.teamSettings },
      ]
    : undefined;
  const workspaceLink = currentUser.platformRole
    ? {
        href: ROUTES.institutions.teamSettings,
        label: t("teamSettings"),
        detail: t("appName"),
      }
    : undefined;
  const versions = await getGitHubChangelogVersions();

  return (
    <>
      <AuthenticatedSiteHeader
        logoHref={
          currentUser.platformRole ? ROUTES.institutions.root : ROUTES.home
        }
        navigation={platformNavigation}
        preloadedCurrentUser={preloadedCurrentUser}
        workspaceLink={workspaceLink}
        signOutRedirectHref={ROUTES.auth.signIn}
      />
      <div className="flex flex-1 flex-col">
        <ChangelogPage locale={locale} versions={versions} />
      </div>
    </>
  );
}
