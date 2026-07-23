import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TenantAcademicManagementPlaceholderPage } from "@/components/academic-management/tenant-academic-management-placeholder-page";
import { TenantPeopleDashboard } from "@/components/people/tenant-people-dashboard";
import { requireLocale } from "@/i18n/locale";
import type { TenantParams } from "@/i18n/params";
import { ROUTES } from "@/lib/navigation/routes";

type TenantAcademicManagementSectionKey = "students" | "teachers";
type TenantAcademicManagementRoleFilter = "student" | "teacher";
type TenantAcademicManagementPlaceholderSectionKey =
  | "academicPeriods"
  | "curriculumOfferings";

export async function generateTenantAcademicManagementSectionMetadata({
  params,
  section,
}: {
  params: TenantParams;
  section: TenantAcademicManagementSectionKey;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "TenantPeople" });

  return {
    title: t(`sections.${section}.title`),
  };
}

export async function renderTenantAcademicManagementSectionPage({
  params,
  section,
  roleFilter,
}: {
  params: TenantParams;
  section: TenantAcademicManagementSectionKey;
  roleFilter: TenantAcademicManagementRoleFilter;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "TenantPeople" });

  return (
    <TenantPeopleDashboard
      accountSelfIcon={section === "students" ? "student" : "teacher"}
      accountSelfLabel={
        section === "students"
          ? t("table.studentProfile")
          : t("table.teacherProfile")
      }
      slug={tenant}
      title={t(`sections.${section}.title`)}
      createPersonLabel={t(`sections.${section}.createPerson`)}
      roleFilter={roleFilter}
      personProfileHrefBase={
        section === "students"
          ? ROUTES.tenant.academicManagementSections.students(tenant)
          : ROUTES.tenant.academicManagementSections.teachers(tenant)
      }
    />
  );
}

export async function generateTenantAcademicManagementPlaceholderSectionMetadata({
  params,
  section,
}: {
  params: TenantParams;
  section: TenantAcademicManagementPlaceholderSectionKey;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({
    locale,
    namespace: "TenantAcademicManagement",
  });

  return {
    title: t(`sections.${section}.title`),
  };
}

export async function renderTenantAcademicManagementPlaceholderSectionPage({
  params,
  section,
  icon,
}: {
  params: TenantParams;
  section: TenantAcademicManagementPlaceholderSectionKey;
  icon: LucideIcon;
}) {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const t = await getTranslations("TenantAcademicManagement");

  return (
    <TenantAcademicManagementPlaceholderPage
      icon={icon}
      title={t(`sections.${section}.title`)}
    />
  );
}
