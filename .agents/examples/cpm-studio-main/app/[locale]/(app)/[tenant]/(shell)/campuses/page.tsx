import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { TenantCampusGrid } from "@/components/tenant/tenant-campus-grid";
import { requireLocale } from "@/i18n/locale";
import type { TenantParams } from "@/i18n/params";
import { listTenantCampuses } from "@/lib/campuses/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import { canManageTenantWorkspace } from "@/lib/tenancy/workspace.server";

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
  const workspace = await getCurrentTenantWorkspace(tenant);
  const t = await translationsPromise;

  if (!workspace) {
    return {
      title: t("pages.campuses"),
    };
  }

  return {
    title: {
      absolute: `${workspace.organization.name} | ${t("pages.campuses")}`,
    },
  };
}

export default async function TenantCampusesPage({
  params,
}: {
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const workspace = await getCurrentTenantWorkspace(tenant);

  if (!workspace) {
    return null;
  }

  const campuses = await listTenantCampuses(tenant);
  const canManageCampuses = canManageTenantWorkspace(workspace);

  return (
    <IntlMessagesProvider namespaces={["TenantHome", "Common"]}>
      <TenantCampusGrid
        canManage={canManageCampuses}
        tenantSlug={tenant}
        campuses={campuses.map((campus) => ({
          _id: campus._id,
          slug: campus.slug,
          name: campus.name,
          imageUrl: campus.imageUrl ?? null,
          isActive: campus.isActive,
          href: ROUTES.tenant.campuses.detail(tenant, campus.slug),
        }))}
      />
    </IntlMessagesProvider>
  );
}
