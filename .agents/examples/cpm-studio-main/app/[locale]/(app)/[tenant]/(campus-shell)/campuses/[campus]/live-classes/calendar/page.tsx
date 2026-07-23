import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { getTenantCampusBySlug } from "@/lib/campuses/server";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import { FlexidualCampusSection } from "@/modules/liveClasses/presentation/flexidual-campus-section";

export async function generateMetadata({
  params,
}: {
  params: TenantCampusParams;
}): Promise<Metadata> {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const [workspace, campusRecord] = await Promise.all([
    getCurrentTenantWorkspace(tenant),
    getTenantCampusBySlug(tenant, campus),
  ]);

  if (!workspace || !campusRecord) {
    return {
      title: t("pages.liveClassesCalendar"),
    };
  }

  return {
    title: {
      absolute: `${t("pages.liveClassesCalendar")} | ${campusRecord.name} | ${workspace.organization.name}`,
    },
  };
}

export default async function TenantCampusLiveClassesCalendarPage({
  params,
}: {
  params: TenantCampusParams;
}) {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const [t, campusRecord] = await Promise.all([
    getTranslations({ locale, namespace: "TenantLiveClasses" }),
    getTenantCampusBySlug(tenant, campus),
  ]);

  if (!campusRecord) {
    notFound();
  }

  return (
    <FlexidualCampusSection
      title={t("calendar.title")}
      description={t("calendar.description")}
      highlightsTitle={t("calendar.highlightsTitle")}
      highlights={[
        t("calendar.highlightScheduling"),
        t("calendar.highlightConflicts"),
        t("calendar.highlightContext"),
      ]}
    />
  );
}
