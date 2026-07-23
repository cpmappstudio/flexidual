import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { LocaleParams } from "@/i18n/params";
import { getCurrentConvexAuthState } from "@/lib/auth/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantHostUrl } from "@/lib/tenancy/domain";

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleEntryPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const { currentUser, token } = await getCurrentConvexAuthState();
  if (!token) {
    return redirect({ href: ROUTES.auth.signIn, locale });
  }

  if (!currentUser) {
    return redirect({ href: ROUTES.auth.signIn, locale });
  }

  if (currentUser.platformRole) {
    return redirect({
      href: ROUTES.institutions.root,
      locale,
    });
  }

  const firstOrganization = await fetchQuery(
    api.organizations.getFirstMine,
    {},
    { token },
  );

  if (firstOrganization) {
    nextRedirect(
      getTenantHostUrl(
        firstOrganization.slug,
        locale,
        ROUTES.tenant.root(firstOrganization.slug),
      ),
    );
  }

  return redirect({ href: ROUTES.auth.signIn, locale });
}
