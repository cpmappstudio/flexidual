"use client";

import { useTranslations } from "next-intl";

import {
  ResponsiveFilters,
  type ResponsiveFilter,
} from "@/components/ui/responsive-filters";
import type { Id } from "@/convex/_generated/dataModel";

type FilterOption = {
  value: string;
  label: string;
};

export type CalendarHeaderFiltersProps = {
  courses: FilterOption[];
  teachers: FilterOption[];
  grades: FilterOption[];
  showTeacherFilter: boolean;
  showGradeFilter: boolean;
  selectedCourseId: Id<"classes"> | null;
  selectedTeacherId: Id<"users"> | null;
  selectedGradeCode: string | null;
  onCourseChange: (id: Id<"classes"> | null) => void;
  onTeacherChange: (id: Id<"users"> | null) => void;
  onGradeChange: (code: string | null) => void;
};

export default function CalendarHeaderFilters({
  courses,
  teachers,
  grades,
  showTeacherFilter,
  showGradeFilter,
  selectedCourseId,
  selectedTeacherId,
  selectedGradeCode,
  onCourseChange,
  onTeacherChange,
  onGradeChange,
}: CalendarHeaderFiltersProps) {
  const t = useTranslations();
  const visibleFilters: ResponsiveFilter[] = [
    {
      key: "courses",
      label: t("class.class"),
      allLabel: t("calendar.allCourses"),
      value: selectedCourseId,
      options: courses,
      onChange: (value) => onCourseChange(value as Id<"classes"> | null),
    },
    ...(showTeacherFilter
      ? [
          {
            key: "teachers",
            label: t("common.teacher"),
            allLabel: t("calendar.allTeachers"),
            value: selectedTeacherId,
            options: teachers,
            onChange: (value: string | null) =>
              onTeacherChange(value as Id<"users"> | null),
          },
        ]
      : []),
    ...(showGradeFilter
      ? [
          {
            key: "grades",
            label: t("class.grade"),
            allLabel: t("calendar.allGrades"),
            value: selectedGradeCode,
            options: grades,
            onChange: onGradeChange,
          },
        ]
      : []),
  ];

  return (
    <ResponsiveFilters
      filters={visibleFilters}
      menuLabel={t("table.filters")}
      clearLabel={t("table.clearFilters")}
      desktopClassName="grid w-full grid-cols-2 gap-2 [&>*:first-child]:col-span-2 sm:grid-cols-3 sm:[&>*:first-child]:col-span-1 xl:flex xl:flex-wrap"
      mobileClassName="hidden"
      selectClassName="w-full xl:w-56"
    />
  );
}
