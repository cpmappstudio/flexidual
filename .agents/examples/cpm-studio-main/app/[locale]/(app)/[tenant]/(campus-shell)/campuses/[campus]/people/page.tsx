import type { Metadata } from "next";
import { notFound, redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { TenantCampusPeopleDashboard } from "@/components/people/tenant-campus-people-dashboard";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { getTenantCampusBySlug } from "@/lib/campuses/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import { canManageTenantWorkspace } from "@/lib/tenancy/workspace.server";

export async function generateMetadata({
  params,
}: {
  params: TenantCampusParams;
}): Promise<Metadata> {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  const [t, campusRecord] = await Promise.all([
    getTranslations({ locale, namespace: "Metadata" }),
    getTenantCampusBySlug(tenant, campus),
  ]);

  return {
    title: campusRecord
      ? {
          absolute: `${t("pages.people")} | ${campusRecord.name}`,
        }
      : t("pages.people"),
  };
}

export default async function TenantCampusPeoplePage({
  params,
}: {
  params: TenantCampusParams;
}) {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const [workspace, campusRecord] = await Promise.all([
    getCurrentTenantWorkspace(tenant),
    getTenantCampusBySlug(tenant, campus),
  ]);

  if (!workspace) {
    nextRedirect(ROUTES.tenant.root(tenant));
  }

  if (!campusRecord) {
    notFound();
  }

  const canManagePeople = canManageTenantWorkspace(workspace);

  if (!canManagePeople) {
    nextRedirect(ROUTES.tenant.campuses.detail(tenant, campus));
  }

  return (
    <IntlMessagesProvider namespaces={["Common", "TenantPeople"]}>
      <TenantCampusPeopleDashboard
        slug={tenant}
        campusId={campusRecord._id}
        campusName={campusRecord.name}
      />
    </IntlMessagesProvider>
  );
}
