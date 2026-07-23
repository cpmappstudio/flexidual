import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getImageFallbackLabel, getOptionalImageSrc } from "@/lib/files/image";
import type {
  FlexidualCourse,
  FlexidualCourseDetailTab,
  FlexidualOrganizationIdentity,
} from "@/modules/liveClasses/lib/flexidual-course-types";
import {
  ContentPanel,
  PeoplePanel,
  SessionsPanel,
} from "@/modules/liveClasses/presentation/course-detail/course-detail-panels";
import { HeroMetric } from "@/modules/liveClasses/presentation/course-detail/course-detail-primitives";
import { FlexidualCourseDetailTabs } from "@/modules/liveClasses/presentation/course-detail/course-detail-tabs";

type FlexidualCourseDetailProps = {
  course: FlexidualCourse;
  organization: FlexidualOrganizationIdentity;
  campusName: string;
  backHref: string;
  defaultTab: FlexidualCourseDetailTab;
};

export function FlexidualCourseDetail({
  course,
  organization,
  campusName,
  backHref,
  defaultTab,
}: FlexidualCourseDetailProps) {
  const t = useTranslations("TenantLiveClasses.courses");
  const detailT = useTranslations("TenantLiveClasses.courses.detail");

  return (
    <section className="flex flex-col">
      <div className="overflow-hidden bg-card shadow-sm">
        <div className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklch,var(--primary)_24%,transparent),transparent_36%),radial-gradient(circle_at_82%_12%,color-mix(in_oklch,var(--muted-foreground)_14%,transparent),transparent_30%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_82%,var(--primary)_6%),color-mix(in_oklch,var(--muted)_88%,var(--background)))]"
          />

          <div className="relative z-10 px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-6">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-fit -translate-x-2"
                >
                  <Link href={backHref}>
                    <ArrowLeft aria-hidden="true" data-icon="inline-start" />
                    {detailT("backToCourses")}
                  </Link>
                </Button>

                <div className="flex items-center gap-4">
                  <Avatar className="size-14">
                    <AvatarImage
                      src={getOptionalImageSrc(organization.imageUrl)}
                      alt={organization.name}
                      className="rounded-2xl object-cover"
                    />
                    <AvatarFallback className="rounded-2xl bg-background/90 text-sm font-semibold">
                      {getImageFallbackLabel({
                        name: organization.name,
                        fallback: "OR",
                      })}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground/80">
                      {organization.name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {detailT("campusLabel")}: {campusName}
                    </p>
                  </div>
                </div>

                <div className="max-w-3xl space-y-4">
                  <div className="space-y-3">
                    <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                      {course.name}
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-foreground/72 sm:text-[0.95rem]">
                      {detailT("heroDescription")}
                    </p>
                  </div>

                  {course.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {course.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="bg-background/70"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <HeroMetric
                    label={t("curriculumLabel")}
                    value={course.curriculumName}
                  />
                  <HeroMetric
                    label={detailT("academicPeriodLabel")}
                    value={course.academicPeriod}
                  />
                  <HeroMetric
                    label={detailT("teacherLabel")}
                    value={course.teacher.name}
                  />
                  <HeroMetric
                    label={detailT("studentsLabel")}
                    value={String(course.students.length)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <FlexidualCourseDetailTabs
          defaultTab={defaultTab}
          tabs={[
            {
              value: "sessions",
              label: detailT("tabs.sessions"),
              content: <SessionsPanel course={course} />,
            },
            {
              value: "content",
              label: detailT("tabs.content"),
              content: <ContentPanel course={course} />,
            },
            {
              value: "people",
              label: detailT("tabs.people"),
              content: <PeoplePanel course={course} />,
            },
          ]}
        />
      </div>
    </section>
  );
}
