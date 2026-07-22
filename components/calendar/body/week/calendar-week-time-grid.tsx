"use client";

import * as React from "react";
import { addDays, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import CalendarBodyHeader from "../calendar-body-header";
import CalendarBodyMarginDayMargin from "../day/calendar-body-margin-day-margin";

interface CalendarTimeGridDayProps {
  date: Date;
  children?: React.ReactNode;
  onlyDayHeader?: boolean;
  startMinutes?: number;
  endMinutes?: number;
  surfaceProps?: React.ComponentPropsWithoutRef<"div">;
}

export function CalendarTimeGridDay({
  date,
  children,
  onlyDayHeader = false,
  startMinutes = 0,
  endMinutes = 24 * 60,
  surfaceProps,
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
      <CalendarBodyHeader date={date} onlyDay={onlyDayHeader} />
      <div
        className={cn("relative shrink-0", className)}
        style={{
          height: `calc(var(--calendar-hour-height) * ${durationMinutes / 60})`,
        }}
        {...props}
      >
        {boundaries.map((minute) => (
          <div
            key={minute}
            className="absolute inset-x-0 border-b border-border/50"
            style={{
              top: `${((minute - startMinutes) / durationMinutes) * 100}%`,
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
}

export function CalendarWeekTimeGrid({
  date,
  renderDayAction,
  className,
  startMinutes = 0,
  endMinutes = 24 * 60,
}: CalendarWeekTimeGridProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
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
              />
              {renderDayAction(day)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
