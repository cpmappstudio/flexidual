import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { getTenantCampusBySlug } from "@/lib/campuses/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import {
  getFlexidualCoursesPermissions,
  getFlexidualCoursesViewRole,
} from "@/modules/liveClasses/lib/flexidual-courses-access";
import { FLEXIDUAL_COURSE_FIXTURES } from "@/modules/liveClasses/lib/flexidual-course-fixtures";
import { FlexidualCoursesGrid } from "@/modules/liveClasses/presentation/flexidual-courses-grid";

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
      title: t("pages.liveClassesCourses"),
    };
  }

  return {
    title: {
      absolute: `${t("pages.liveClassesCourses")} | ${campusRecord.name} | ${workspace.organization.name}`,
    },
  };
}

export default async function TenantCampusLiveClassesCoursesPage({
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

  if (!workspace || !campusRecord) {
    notFound();
  }

  const viewerRole = getFlexidualCoursesViewRole({
    effectiveRole: workspace.effectiveRole,
    isPlatformAdmin: workspace.isPlatformAdmin,
  });
  const permissions = getFlexidualCoursesPermissions(viewerRole);

  return (
    <IntlMessagesProvider namespaces={["TenantLiveClasses"]}>
      <FlexidualCoursesGrid
        courses={FLEXIDUAL_COURSE_FIXTURES.map((course) => ({
          ...course,
          href: ROUTES.tenant.campuses.liveClasses.courseDetail(
            tenant,
            campus,
            course.id,
          ),
        }))}
        permissions={permissions}
        organization={{
          name: workspace.organization.name,
          imageUrl: workspace.organization.imageUrl ?? null,
        }}
      />
    </IntlMessagesProvider>
  );
}
