"use client";

import * as React from "react";
import { addDays, startOfWeek } from "date-fns";
import { tz } from "@date-fns/tz";
import { cn } from "@/lib/utils";
import CalendarBodyHeader from "../calendar-body-header";
import CalendarBodyMarginDayMargin from "../day/calendar-body-margin-day-margin";
import {
  CalendarTimeScale,
  getTimeScalePercent,
} from "../../calendar-time-scale";

interface CalendarTimeGridDayProps {
  date: Date;
  children?: React.ReactNode;
  onlyDayHeader?: boolean;
  startMinutes?: number;
  endMinutes?: number;
  timeScale?: CalendarTimeScale;
  surfaceProps?: React.ComponentPropsWithoutRef<"div">;
  showHeader?: boolean;
  displayTimeZone?: string;
}

export function CalendarTimeGridDay({
  date,
  children,
  onlyDayHeader = false,
  startMinutes = 0,
  endMinutes = 24 * 60,
  timeScale,
  surfaceProps,
  showHeader = true,
  displayTimeZone,
}: CalendarTimeGridDayProps) {
  const { className, ...props } = surfaceProps ?? {};
  const durationMinutes = endMinutes - startMinutes;
  const firstBoundary = Math.ceil(startMinutes / 60) * 60;
  const boundaries = Array.from(
    { length: Math.floor((endMinutes - firstBoundary) / 60) + 1 },
    (_, index) => firstBoundary + index * 60,
  ).filter((minute) => minute > startMinutes && minute <= endMinutes);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-sidebar">
      {showHeader && (
        <CalendarBodyHeader
          date={date}
          onlyDay={onlyDayHeader}
          displayTimeZone={displayTimeZone}
        />
      )}
      <div
        className={cn("relative shrink-0", className)}
        style={{
          height: timeScale
            ? `calc(var(--calendar-hour-height) * ${timeScale.totalUnits})`
            : `calc(var(--calendar-hour-height) * ${durationMinutes / 60})`,
        }}
        {...props}
      >
        {boundaries.map((minute) => (
          <div
            key={minute}
            className="absolute inset-x-0 border-b border-border/50"
            style={{
              top: timeScale
                ? `${getTimeScalePercent(timeScale, minute)}%`
                : `${((minute - startMinutes) / durationMinutes) * 100}%`,
            }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

interface CalendarWeekTimeGridProps {
  date: Date;
  renderDayAction: (day: Date) => React.ReactNode;
  className?: string;
  startMinutes?: number;
  endMinutes?: number;
  displayTimeZone: string;
}

export function CalendarWeekTimeGrid({
  date,
  renderDayAction,
  className,
  startMinutes = 0,
  endMinutes = 24 * 60,
  displayTimeZone,
}: CalendarWeekTimeGridProps) {
  const dateContext = { in: tz(displayTimeZone) };
  const weekStart = startOfWeek(date, {
    weekStartsOn: 1,
    ...dateContext,
  });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index, dateContext),
  );

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-sidebar [--calendar-hour-height:4rem] xl:[--calendar-hour-height:5rem] 2xl:[--calendar-hour-height:6rem]",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative flex min-h-full flex-col divide-x md:flex-row">
          <CalendarBodyMarginDayMargin
            className="hidden md:block"
            startMinutes={startMinutes}
            endMinutes={endMinutes}
            displayTimeZone={displayTimeZone}
          />
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="flex min-w-0 flex-1 divide-x md:divide-x-0"
            >
              <CalendarBodyMarginDayMargin
                className="block md:hidden"
                startMinutes={startMinutes}
                endMinutes={endMinutes}
                displayTimeZone={displayTimeZone}
              />
              {renderDayAction(day)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
