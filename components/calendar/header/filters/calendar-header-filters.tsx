"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Check, ListFilter, X } from "lucide-react";
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
  showGradeFilter: boolean;
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
}: {
  label: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{label}</span>
          {value && (
            <Badge
              color="zinc"
              className="h-5 min-w-5 justify-center rounded-full px-1"
            >
              1
            </Badge>
          )}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuItem
          onSelect={() => onChange(null)}
          className="justify-between gap-3"
        >
          <span>{allLabel}</span>
          {!value && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className="justify-between gap-3"
          >
            <span>{option.label}</span>
            {value === option.value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function CalendarInlineFilter({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(nextValue) =>
        onChange(nextValue === ALL ? null : nextValue)
      }
    >
      <SelectTrigger className="w-40 bg-card sm:w-48" aria-label={label}>
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

function CalendarFilterMobile({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="border-b pb-2 last:border-b-0 last:pb-0">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <DropdownMenuItem
        onSelect={() => onChange(null)}
        className="justify-between gap-3"
      >
        <span>{allLabel}</span>
        {!value && <Check className="h-4 w-4" />}
      </DropdownMenuItem>
      {options.map((option) => (
        <DropdownMenuItem
          key={option.value}
          onSelect={() => onChange(option.value)}
          className="justify-between gap-3"
        >
          <span>{option.label}</span>
          {value === option.value && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      ))}
    </div>
  );
}

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
  const visibleFilters = [
    {
      key: "courses",
      label: t("class.class"),
      allLabel: t("calendar.allCourses"),
      value: selectedCourseId,
      options: courses,
      onChange: (value: string | null) =>
        onCourseChange(value as Id<"classes"> | null),
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
  const activeFilterCount = visibleFilters.filter((filter) =>
    Boolean(filter.value),
  ).length;
  const hasActiveFilters = activeFilterCount > 0;
  const clearFilters = () => {
    onCourseChange(null);
    onTeacherChange(null);
    onGradeChange(null);
  };
  const shouldGroupFilters = visibleFilters.length > 1;

  if (!shouldGroupFilters) {
    const filter = visibleFilters[0];

    return (
      <CalendarInlineFilter
        label={filter.label}
        allLabel={filter.allLabel}
        value={filter.value}
        options={filter.options}
        onChange={filter.onChange}
      />
    );
  }

  return (
    <DropdownMenu>
      <div className="relative inline-flex overflow-visible">
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "cursor-pointer",
              hasActiveFilters && "border-2 border-primary",
            )}
            aria-label={t("table.filters")}
          >
            <ListFilter className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("table.filters")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="md:hidden">
          <div className="space-y-2">
            {visibleFilters.map((filter) => (
              <CalendarFilterMobile
                key={filter.key}
                label={filter.label}
                allLabel={filter.allLabel}
                value={filter.value}
                options={filter.options}
                onChange={filter.onChange}
              />
            ))}
          </div>
        </div>

        <div className="hidden md:block">
          {visibleFilters.map((filter) => (
            <CalendarFilter
              key={filter.key}
              label={filter.label}
              allLabel={filter.allLabel}
              value={filter.value}
              options={filter.options}
              onChange={filter.onChange}
            />
          ))}
        </div>

        {hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={clearFilters}>
              <X className="mr-2 h-4 w-4" />
              {t("table.clearFilters")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
