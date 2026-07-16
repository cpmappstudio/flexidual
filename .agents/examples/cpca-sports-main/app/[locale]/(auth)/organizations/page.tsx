import { OrganizationList } from "@clerk/nextjs";
import { ROUTES } from "@/lib/navigation/routes";
import { routing } from "@/i18n/routing";
import { redirect } from "next/navigation";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "@/lib/tenancy/config";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function OrganizationListPage({ params }: PageProps) {
  const { locale } = await params;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  if (isSingleTenantMode()) {
    redirect(
      `${localePrefix}${ROUTES.org.applications.list(DEFAULT_TENANT_SLUG)}`,
    );
  }

  const afterSelectOrganizationUrl = `${localePrefix}/:slug/applications`;
  const organizationsUrl = `${localePrefix}${ROUTES.auth.organizations}`;

  return (
    <OrganizationList
      afterCreateOrganizationUrl={afterSelectOrganizationUrl}
      afterSelectPersonalUrl={organizationsUrl}
      afterSelectOrganizationUrl={afterSelectOrganizationUrl}
    />
  );
}
