import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { TenantTeamSettingsDashboard } from "@/components/people/tenant-team-settings-dashboard";
import { requireLocale } from "@/i18n/locale";
import type { TenantParams } from "@/i18n/params";
import { requireManageableTenantWorkspace } from "@/lib/tenancy/workspace.server";

export async function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.teamSettings"),
  };
}

export default async function TenantTeamSettingsPage({
  params,
}: {
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const workspace = await requireManageableTenantWorkspace(tenant);

  return (
    <IntlMessagesProvider namespaces={["Common", "TenantTeam"]}>
      <TenantTeamSettingsDashboard
        slug={tenant}
        organization={workspace.organization}
        canManage
        canAssignOwner={workspace.effectiveRole === "owner"}
        canDeactivateOrganization={workspace.effectiveRole === "owner"}
      />
    </IntlMessagesProvider>
  );
}
