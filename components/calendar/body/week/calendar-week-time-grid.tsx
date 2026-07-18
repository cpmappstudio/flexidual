"use client";

import * as React from "react";
import { addDays, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import CalendarBodyHeader from "../calendar-body-header";
import CalendarBodyMarginDayMargin, {
  hours,
} from "../day/calendar-body-margin-day-margin";

interface CalendarTimeGridDayProps {
  date: Date;
  children?: React.ReactNode;
  onlyDayHeader?: boolean;
  surfaceProps?: React.ComponentPropsWithoutRef<"div">;
}

export function CalendarTimeGridDay({
  date,
  children,
  onlyDayHeader = false,
  surfaceProps,
}: CalendarTimeGridDayProps) {
  const { className, ...props } = surfaceProps ?? {};

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-sidebar">
      <CalendarBodyHeader date={date} onlyDay={onlyDayHeader} />
      <div
        className={cn("relative shrink-0", className)}
        {...props}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="h-(--calendar-hour-height) border-b border-border/50"
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
  initialScrollHour?: number;
}

export function CalendarWeekTimeGrid({
  date,
  renderDayAction,
  className,
  initialScrollHour,
}: CalendarWeekTimeGridProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekStartTime = weekStart.getTime();
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );

  React.useEffect(() => {
    if (initialScrollHour === undefined || !scrollRef.current) return;
    scrollRef.current.scrollTop =
      (scrollRef.current.scrollHeight / 24) * initialScrollHour;
  }, [weekStartTime, initialScrollHour]);

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-sidebar [--calendar-hour-height:4rem] xl:[--calendar-hour-height:5rem] 2xl:[--calendar-hour-height:6rem]",
        className,
      )}
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-scroll overscroll-contain [scrollbar-gutter:stable]"
      >
        <div className="relative flex min-h-full flex-col divide-x md:flex-row">
          <CalendarBodyMarginDayMargin className="hidden md:block" />
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="flex min-w-0 flex-1 divide-x md:divide-x-0"
            >
              <CalendarBodyMarginDayMargin className="block md:hidden" />
              {renderDayAction(day)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
