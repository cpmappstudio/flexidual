"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useDateTimeFormatter } from "@/hooks/use-date-time-formatter";
import { TenantAcademicProfilePanel as ProfilePanel } from "@/components/people/tenant-academic-profile-panel";
import Heatmap from "@/components/ui/heatmap";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TenantOrganizationPersonActivityDay = {
  date: string;
  value: number;
};

const ACTIVITY_HEATMAP_COLOR_SCALE = [
  "color-mix(in oklab, var(--muted) 72%, transparent)",
  "var(--primary)",
];

function getActivityRangeForYear(year: number) {
  return {
    endDate: new Date(year, 11, 31),
    startDate: new Date(year, 0, 1),
  };
}

function ActivityHeatmapContent({
  activityDays,
  selectedYear,
}: {
  activityDays: TenantOrganizationPersonActivityDay[];
  selectedYear: string;
}) {
  const t = useTranslations("TenantPeople");
  const locale = useLocale();
  const activityRange = useMemo(
    () => getActivityRangeForYear(Number(selectedYear)),
    [selectedYear],
  );
  const dateFormatter = useDateTimeFormatter(locale, "date");
  const activeDays = activityDays.map(({ date, value }) => ({
    date,
    value: value > 0 ? 1 : 0,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="max-w-full overflow-x-auto overscroll-x-contain pb-2 pt-3">
        <Heatmap
          className="min-w-max"
          colorMode="discrete"
          colorScale={ACTIVITY_HEATMAP_COLOR_SCALE}
          data={activeDays}
          daysOfTheWeek="single letter"
          endDate={activityRange.endDate}
          gap={4}
          startDate={activityRange.startDate}
          cellSize={11}
          cellLabelFunction={(date, value) =>
            `${value > 0 ? t("profile.activityActive") : t("profile.activityInactive")}: ${dateFormatter.format(date)}`
          }
          tooltipContentFunction={(date, value) => (
            <div className="text-xs">
              <div className="text-background">
                {value > 0
                  ? t("profile.activityActive")
                  : t("profile.activityInactive")}
              </div>
              <div className="text-background/70">
                {dateFormatter.format(date)}
              </div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

function ActivityYearSelect({
  onYearChange,
  selectedYear,
  yearOptions,
}: {
  onYearChange: (year: string) => void;
  selectedYear: string;
  yearOptions: string[];
}) {
  const t = useTranslations("TenantPeople");

  return (
    <Select value={selectedYear} onValueChange={onYearChange}>
      <SelectTrigger
        aria-label={t("profile.activityYear")}
        size="sm"
        className="min-w-20"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {yearOptions.map((year) => (
            <SelectItem key={year} value={year}>
              {year}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function TenantOrganizationPersonActivityPanel({
  activityDays,
  onYearChange,
  selectedYear,
  yearOptions,
}: {
  activityDays: TenantOrganizationPersonActivityDay[];
  onYearChange: (year: string) => void;
  selectedYear: string;
  yearOptions: string[];
}) {
  const t = useTranslations("TenantPeople");

  return (
    <ProfilePanel
      title={t("profile.userActivity")}
      action={
        <ActivityYearSelect
          selectedYear={selectedYear}
          yearOptions={yearOptions}
          onYearChange={onYearChange}
        />
      }
    >
      <ActivityHeatmapContent
        activityDays={activityDays}
        selectedYear={selectedYear}
      />
    </ProfilePanel>
  );
}
