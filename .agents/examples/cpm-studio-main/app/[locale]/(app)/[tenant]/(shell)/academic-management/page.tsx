import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import type { TenantParams } from "@/i18n/params";
import { ROUTES } from "@/lib/navigation/routes";

export async function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("pages.academicManagement"),
  };
}

export default async function TenantAcademicManagementPage({
  params,
}: {
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  return redirect({
    href: ROUTES.tenant.academicManagementSections.students(tenant),
    locale,
  });
}
