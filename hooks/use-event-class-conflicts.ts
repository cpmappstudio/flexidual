"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { localDateTimeToUtc } from "@/lib/time-zone";

export function useEventClassConflicts({
  schoolId,
  campusId,
  gradeCodes,
  start,
  end,
  timeZone,
  enabled,
}: {
  schoolId?: Id<"schools">;
  campusId?: Id<"campuses">;
  gradeCodes?: string[];
  start: string;
  end: string;
  timeZone: string;
  enabled: boolean;
}) {
  const interval = useMemo(() => {
    if (!enabled || !start || !end) return null;
    try {
      const from = localDateTimeToUtc(start, timeZone);
      const to = localDateTimeToUtc(end, timeZone);
      return to > from ? { from, to } : null;
    } catch {
      return null;
    }
  }, [enabled, end, start, timeZone]);
  const classes = useQuery(
    api.calendar.listEvents,
    interval && schoolId
      ? {
          schoolId,
          campusId,
          from: interval.from - 24 * 60 * 60_000,
          to: interval.to,
        }
      : "skip",
  );
  return classes?.filter(
    (item) =>
      interval &&
      item.status !== "cancelled" &&
      item.start < interval.to &&
      item.end > interval.from &&
      (!gradeCodes?.length ||
        !item.gradeCodes?.length ||
        item.gradeCodes.some((code) => gradeCodes.includes(code))),
  );
}
