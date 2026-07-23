import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { PageContentContainer } from "@/components/layout/page-content-container";
import { PlatformAdminDashboard } from "@/components/platform/platform-admin-dashboard";
import { requireLocale } from "@/i18n/locale";
import type { LocaleParams } from "@/i18n/params";
import { getCurrentConvexAuthState } from "@/lib/auth/server";
import { getRootDomain } from "@/lib/tenancy/domain";

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.institutions"),
  };
}

export default async function InstitutionsPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const { currentUser } = await getCurrentConvexAuthState();
  const rootDomain = getRootDomain();

  return (
    <PageContentContainer>
      <IntlMessagesProvider namespaces={["PlatformAdmin", "Common"]}>
        <PlatformAdminDashboard
          canManage={currentUser?.platformRole === "superadmin"}
          locale={locale}
          rootDomain={rootDomain}
        />
      </IntlMessagesProvider>
    </PageContentContainer>
  );
}
