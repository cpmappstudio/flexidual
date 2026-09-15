"use client";

import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { dateInTimeZone } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import type { CalendarClosureSummary } from "./calendar-closure-types";

export function groupCalendarClosuresByDate(
  closures: CalendarClosureSummary[],
  displayTimeZone: string,
) {
  const closuresByDate = new Map<string, CalendarClosureSummary[]>();

  for (const closure of closures) {
    const dateKey = dateInTimeZone(closure.startsAt, displayTimeZone);
    const dayClosures = closuresByDate.get(dateKey) ?? [];
    dayClosures.push(closure);
    closuresByDate.set(dateKey, dayClosures);
  }

  return closuresByDate;
}

export function getCalendarClosuresForDate(
  closuresByDate: Map<string, CalendarClosureSummary[]>,
  date: Date,
  displayTimeZone: string,
) {
  return (
    closuresByDate.get(dateInTimeZone(date.getTime(), displayTimeZone)) ?? []
  );
}

export function hasAllDayCalendarClosure(closures: CalendarClosureSummary[]) {
  return closures.some((closure) => closure.isAllDay);
}

export function CalendarClosureBadge({
  closures,
  compact = false,
  className,
}: {
  closures: CalendarClosureSummary[];
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("calendar.closures");
  const locale = useLocale();
  if (closures.length === 0) return null;

  const [closure] = closures;
  const remainingCount = closures.length - 1;
  const timing = closure.isAllDay
    ? t("dayWithoutClasses")
    : `${new Date(closure.startsAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: closure.timeZone,
      })}–${new Date(closure.endsAt).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: closure.timeZone,
      })}`;
  const scope = closure.gradeCode ? `${timing} · ${closure.gradeCode}` : timing;
  const reasons = closures.map((item) => item.reason).join(" · ");
  const accessibleLabel = `${scope}: ${closures
    .map((item) => item.reason)
    .join(", ")}`;

  return (
    <Badge
      variant="outline"
      role="note"
      aria-label={accessibleLabel}
      title={`${reasons} · ${scope}`}
      className={cn(
        "min-w-0 max-w-full shrink border-warning/40 bg-warning/10 text-warning-foreground",
        compact ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        className,
      )}
    >
      <CalendarDays className={cn("shrink-0", compact ? "size-3" : "size-4")} />
      <span className="min-w-0 truncate font-semibold leading-tight">
        {closure.reason}
      </span>
      {remainingCount > 0 && (
        <span className="shrink-0 text-[9px] font-semibold">
          +{remainingCount}
        </span>
      )}
    </Badge>
  );
}
