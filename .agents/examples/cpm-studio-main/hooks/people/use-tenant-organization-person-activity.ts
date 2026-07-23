"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function getActivityYearOptions(personCreatedAt: number, now: Date) {
  const firstYear = new Date(personCreatedAt).getFullYear();
  const currentYear = now.getFullYear();
  const yearCount = Math.max(currentYear - firstYear + 1, 1);

  return Array.from({ length: yearCount }, (_, index) =>
    String(currentYear - index),
  );
}

export function useTenantOrganizationPersonActivity({
  organizationPersonId,
  personCreatedAt,
  slug,
}: {
  organizationPersonId: Id<"organizationPeople"> | null | undefined;
  personCreatedAt: number | null | undefined;
  slug: string;
}) {
  const [now] = useState(() => new Date());
  const [selectedYear, setSelectedYear] = useState(() =>
    String(now.getFullYear()),
  );
  const yearOptions =
    typeof personCreatedAt === "number"
      ? getActivityYearOptions(personCreatedAt, now)
      : [String(now.getFullYear())];
  const effectiveYear = yearOptions.includes(selectedYear)
    ? selectedYear
    : (yearOptions[0] ?? String(now.getFullYear()));
  const activity = useQuery(
    api.platform.activity.getOrganizationPersonActivityForYear,
    organizationPersonId
      ? {
          slug,
          organizationPersonId,
          year: Number(effectiveYear),
        }
      : "skip",
  );

  return {
    activityDays: activity?.days ?? [],
    lastSeenAt: activity?.lastSeenAt ?? null,
    selectedYear: effectiveYear,
    setSelectedYear,
    yearOptions,
  };
}
