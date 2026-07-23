import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { getTenantCampusBySlug } from "@/lib/campuses/server";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import { FlexidualCampusHome } from "@/modules/liveClasses/presentation/flexidual-campus-home";

export async function generateMetadata({
  params,
}: {
  params: TenantCampusParams;
}): Promise<Metadata> {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  const translationsPromise = getTranslations({
    locale,
    namespace: "Metadata",
  });
  const [workspace, campusRecord] = await Promise.all([
    getCurrentTenantWorkspace(tenant),
    getTenantCampusBySlug(tenant, campus),
  ]);
  const t = await translationsPromise;

  if (!workspace || !campusRecord) {
    return {
      title: t("pages.liveClasses"),
    };
  }

  return {
    title: {
      absolute: `${t("pages.liveClasses")} | ${campusRecord.name} | ${workspace.organization.name}`,
    },
  };
}

export default async function TenantCampusLiveClassesPage({
  params,
}: {
  params: TenantCampusParams;
}) {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const campusRecord = await getTenantCampusBySlug(tenant, campus);

  if (!campusRecord) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "TenantLiveClasses" });

  return (
    <FlexidualCampusHome
      title={t("title")}
      description={t("description")}
      statusLabel={t("statusLabel")}
      statusValue={t("statusValue")}
      campusLabel={t("campusLabel")}
      campusValue={campusRecord.name}
      capabilityLabel={t("capabilityLabel")}
      capabilityValue={t("capabilityValue")}
      nextStepsTitle={t("nextStepsTitle")}
      nextStepSessions={t("nextStepSessions")}
      nextStepAttendance={t("nextStepAttendance")}
      nextStepParticipants={t("nextStepParticipants")}
    />
  );
}
