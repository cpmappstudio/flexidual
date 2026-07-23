import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthenticatedSiteHeader } from "@/components/authenticated-site-header";
import { api } from "@/convex/_generated/api";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { LocaleParams } from "@/i18n/params";
import { getConvexAuthToken } from "@/lib/auth/server";
import { ROUTES } from "@/lib/navigation/routes";

export default async function InstitutionsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: LocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const token = await getConvexAuthToken();
  if (!token) {
    return redirect({ href: ROUTES.auth.signIn, locale });
  }

  const preloadedCurrentUser = await preloadQuery(api.users.current, {}, { token });
  const currentUser = preloadedQueryResult(preloadedCurrentUser);

  if (!currentUser) {
    return redirect({ href: ROUTES.auth.signIn, locale });
  }

  if (!currentUser.platformRole) {
    notFound();
  }

  const t = await getTranslations("Common");

  return (
    <>
      <AuthenticatedSiteHeader
        logoHref={ROUTES.institutions.root}
        navigation={[
          { label: t("institutions"), href: ROUTES.institutions.root },
          { label: t("teamSettings"), href: ROUTES.institutions.teamSettings },
        ]}
        preloadedCurrentUser={preloadedCurrentUser}
        workspaceLink={{
          href: ROUTES.institutions.teamSettings,
          label: t("teamSettings"),
          detail: t("appName"),
        }}
        signOutRedirectHref={ROUTES.auth.signIn}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
