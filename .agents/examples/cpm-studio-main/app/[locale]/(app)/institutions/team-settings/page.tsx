import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { PageContentContainer } from "@/components/layout/page-content-container";
import { PlatformTeamDashboard } from "@/components/platform/platform-team-dashboard";
import { requireLocale } from "@/i18n/locale";
import type { LocaleParams } from "@/i18n/params";
import { getCurrentConvexAuthState } from "@/lib/auth/server";

export async function generateMetadata({
  params,
}: {
  params: LocaleParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.teamSettings"),
  };
}

export default async function InstitutionsTeamSettingsPage({
  params,
}: {
  params: LocaleParams;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const { currentUser } = await getCurrentConvexAuthState();

  return (
    <PageContentContainer>
      <IntlMessagesProvider namespaces={["PlatformTeam"]}>
        <PlatformTeamDashboard
          currentUserId={currentUser?._id ?? null}
          canManage={currentUser?.platformRole === "superadmin"}
        />
      </IntlMessagesProvider>
    </PageContentContainer>
  );
}
