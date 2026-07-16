import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { routing } from "@/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string; tenant: string }>;
}

export default async function OrganizationListPage({ params }: PageProps) {
  const { locale, tenant } = await params;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  redirect(`${localePrefix}${ROUTES.org.applications.list(tenant)}`);
}
