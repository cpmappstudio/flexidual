"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TenantPeopleSearchField } from "@/components/people/tenant-people-search-field";
import {
  ResourceCreateTileButton,
  ResourceCollectionGrid,
  ResourceCollectionSection,
} from "@/components/resources/resource-collection";
import type { FlexidualCoursesPermissions } from "@/modules/liveClasses/lib/flexidual-courses-access";
import type { FlexidualCourseCard } from "@/modules/liveClasses/lib/flexidual-course-types";
import { FlexidualCoursePeriodFilterSelect } from "@/modules/liveClasses/presentation/flexidual-course-period-filter-select";
import { FlexidualCourseTile } from "@/modules/liveClasses/presentation/flexidual-course-tile";

export function FlexidualCoursesGrid({
  courses,
  permissions,
  organization,
}: {
  courses: FlexidualCourseCard[];
  permissions: FlexidualCoursesPermissions;
  organization: {
    name: string;
    imageUrl?: string | null;
  };
}) {
  const t = useTranslations("TenantLiveClasses");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [academicPeriod, setAcademicPeriod] = useState("all");

  const periods = useMemo(
    () => [...new Set(courses.map((course) => course.academicPeriod))].sort(),
    [courses],
  );

  const filteredCourses = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesPeriod =
        academicPeriod === "all" || course.academicPeriod === academicPeriod;
      const matchesSearch =
        normalizedQuery.length === 0 ||
        course.name.toLowerCase().includes(normalizedQuery);

      return matchesPeriod && matchesSearch;
    });
  }, [academicPeriod, courses, deferredSearchQuery]);

  return (
    <ResourceCollectionSection title={t("courses.title")}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TenantPeopleSearchField
              ariaLabel={t("courses.filters.search")}
              name="flexidual-courses-search"
              placeholder={t("courses.filters.searchPlaceholder")}
              value={searchQuery}
              onValueChange={setSearchQuery}
            />

            <FlexidualCoursePeriodFilterSelect
              value={academicPeriod}
              periods={periods}
              onValueChange={setAcademicPeriod}
              allLabel={t("courses.filters.allAcademicPeriods")}
              ariaLabel={t("courses.filters.academicPeriod")}
            />
          </div>
        </div>

        <ResourceCollectionGrid>
          {permissions.canCreateCourse ? (
            <li className="h-full">
              <ResourceCreateTileButton
                label={t("courses.createCourse")}
                disabled
              />
            </li>
          ) : null}

          {filteredCourses.map((course) => (
            <li key={course.id}>
              <FlexidualCourseTile
                course={course}
                curriculumLabel={t("courses.curriculumLabel")}
                organization={organization}
              />
            </li>
          ))}
        </ResourceCollectionGrid>
      </div>
    </ResourceCollectionSection>
  );
}
