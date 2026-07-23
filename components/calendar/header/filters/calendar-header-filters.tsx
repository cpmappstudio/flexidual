"use client";

import type { Id } from "@/convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

const ALL = "all";

type FilterOption = {
  value: string;
  label: string;
};

export type CalendarHeaderFiltersProps = {
  courses: FilterOption[];
  teachers: FilterOption[];
  grades: FilterOption[];
  showTeacherFilter: boolean;
  selectedCourseId: Id<"classes"> | null;
  selectedTeacherId: Id<"users"> | null;
  selectedGradeCode: string | null;
  onCourseChange: (id: Id<"classes"> | null) => void;
  onTeacherChange: (id: Id<"users"> | null) => void;
  onGradeChange: (code: string | null) => void;
};

function CalendarFilter({
  label,
  allLabel,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
  className: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(nextValue) =>
        onChange(nextValue === ALL ? null : nextValue)
      }
    >
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function CalendarHeaderFilters({
  courses,
  teachers,
  grades,
  showTeacherFilter,
  selectedCourseId,
  selectedTeacherId,
  selectedGradeCode,
  onCourseChange,
  onTeacherChange,
  onGradeChange,
}: CalendarHeaderFiltersProps) {
  const t = useTranslations();

  return (
    <>
      <CalendarFilter
        label={t("class.class")}
        allLabel={t("calendar.allCourses")}
        value={selectedCourseId}
        options={courses}
        onChange={(value) => onCourseChange(value as Id<"classes"> | null)}
        className="w-40 sm:w-48"
      />
      {showTeacherFilter && (
        <CalendarFilter
          label={t("common.teacher")}
          allLabel={t("calendar.allTeachers")}
          value={selectedTeacherId}
          options={teachers}
          onChange={(value) => onTeacherChange(value as Id<"users"> | null)}
          className="w-40 sm:w-48"
        />
      )}
      <CalendarFilter
        label={t("class.grade")}
        allLabel={t("calendar.allGrades")}
        value={selectedGradeCode}
        options={grades}
        onChange={onGradeChange}
        className="w-36 sm:w-40"
      />
    </>
  );
}
