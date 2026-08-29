"use client";

import { useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ResponsiveFilters,
  type ResponsiveFilter,
} from "@/components/ui/responsive-filters";

export function ClassFilters({
  periods,
  selectedAcademicPeriodId,
  onSelectAcademicPeriod,
  selectedTeacherId,
  onSelectTeacher,
  selectedCurriculumId,
  onSelectCurriculum,
  selectedGradeCode,
  onSelectGrade,
  curriculums,
  grades,
  teachers,
  isAdmin,
}: {
  periods: Doc<"academicPeriods">[];
  selectedAcademicPeriodId: Id<"academicPeriods"> | null;
  onSelectAcademicPeriod: (id: Id<"academicPeriods"> | null) => void;
  selectedTeacherId: Id<"users"> | null;
  onSelectTeacher: (id: Id<"users"> | null) => void;
  selectedCurriculumId: Id<"curriculums"> | null;
  onSelectCurriculum: (id: Id<"curriculums"> | null) => void;
  selectedGradeCode: string | null;
  onSelectGrade: (code: string | null) => void;
  curriculums: Doc<"curriculums">[];
  grades: Doc<"institutionGrades">[];
  teachers: {
    _id: Id<"users">;
    fullName: string;
    email?: string;
    imageUrl?: string;
  }[];
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const filters: ResponsiveFilter[] = [
    {
      key: "academicPeriod",
      label: t("class.academicPeriod"),
      allLabel: t("class.allAcademicPeriods"),
      value: selectedAcademicPeriodId,
      options: periods.map((period) => ({
        value: period._id,
        label: period.name,
      })),
      onChange: (value) =>
        onSelectAcademicPeriod(value as Id<"academicPeriods"> | null),
    },
    {
      key: "grade",
      label: t("class.grade"),
      allLabel: t("calendar.allGrades"),
      value: selectedGradeCode,
      options: grades.map((grade) => ({
        value: grade.code,
        label: grade.name,
      })),
      onChange: onSelectGrade,
    },
    {
      key: "curriculum",
      label: t("navigation.curriculum"),
      allLabel: t("navigation.allCurriculums"),
      value: selectedCurriculumId,
      options: curriculums.map((curriculum) => ({
        value: curriculum._id,
        label: curriculum.title,
      })),
      onChange: (value) =>
        onSelectCurriculum(value as Id<"curriculums"> | null),
    },
    ...(isAdmin
      ? [
          {
            key: "teacher",
            label: t("navigation.teacher"),
            allLabel: t("calendar.allTeachers"),
            value: selectedTeacherId,
            options: teachers.map((teacher) => ({
              value: teacher._id,
              label: teacher.fullName,
            })),
            onChange: (value: string | null) =>
              onSelectTeacher(value as Id<"users"> | null),
          },
        ]
      : []),
  ];

  return (
    <ResponsiveFilters
      filters={filters}
      menuLabel={t("table.filters")}
      clearLabel={t("table.clearFilters")}
      desktopClassName="hidden xl:flex"
      mobileClassName="xl:hidden"
    />
  );
}
