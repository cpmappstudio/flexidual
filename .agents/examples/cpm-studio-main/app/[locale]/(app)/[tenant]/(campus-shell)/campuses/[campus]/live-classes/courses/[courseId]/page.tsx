import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { getTenantCampusBySlug } from "@/lib/campuses/server";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import { getFlexidualCourseFixtureById } from "@/modules/liveClasses/lib/flexidual-course-fixtures";
import {
  DEFAULT_FLEXIDUAL_COURSE_DETAIL_TAB,
  isFlexidualCourseDetailTab,
} from "@/modules/liveClasses/lib/flexidual-course-types";
import { FlexidualCourseDetail } from "@/modules/liveClasses/presentation/course-detail/course-detail";

type FlexidualCourseDetailParams = Promise<
  Awaited<TenantCampusParams> & {
    courseId: string;
  }
>;

type FlexidualCourseDetailSearchParams = Promise<{
  tab?: string;
}>;

async function getCourseDetailRouteContext(
  tenant: string,
  campus: string,
  courseId: string,
) {
  const course = getFlexidualCourseFixtureById(courseId);

  const [workspace, campusRecord] = await Promise.all([
    getCurrentTenantWorkspace(tenant),
    getTenantCampusBySlug(tenant, campus),
  ]);

  return {
    course,
    workspace,
    campusRecord,
  };
}

export async function generateMetadata({
  params,
}: {
  params: FlexidualCourseDetailParams;
}): Promise<Metadata> {
  const { locale: requestedLocale, tenant, campus, courseId } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const { course, workspace, campusRecord } = await getCourseDetailRouteContext(
    tenant,
    campus,
    courseId,
  );

  if (!course || !workspace || !campusRecord) {
    return {
      title: t("pages.liveClassesCourses"),
    };
  }

  return {
    title: {
      absolute: `${course.name} | ${campusRecord.name} | ${workspace.organization.name}`,
    },
  };
}

export default async function TenantCampusLiveClassesCourseDetailPage({
  params,
  searchParams,
}: {
  params: FlexidualCourseDetailParams;
  searchParams: FlexidualCourseDetailSearchParams;
}) {
  const { locale: requestedLocale, tenant, campus, courseId } = await params;
  const { tab } = await searchParams;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);
  const { course, workspace, campusRecord } = await getCourseDetailRouteContext(
    tenant,
    campus,
    courseId,
  );

  if (!course) {
    notFound();
  }

  if (!workspace || !campusRecord) {
    notFound();
  }

  const defaultTab = isFlexidualCourseDetailTab(tab)
    ? tab
    : DEFAULT_FLEXIDUAL_COURSE_DETAIL_TAB;

  return (
    <div className="-mx-4 -my-10">
      <FlexidualCourseDetail
        course={course}
        organization={{
          name: workspace.organization.name,
          imageUrl: workspace.organization.imageUrl ?? null,
        }}
        campusName={campusRecord.name}
        backHref={ROUTES.tenant.campuses.liveClasses.courses(tenant, campus)}
        defaultTab={defaultTab}
      />
    </div>
  );
}
