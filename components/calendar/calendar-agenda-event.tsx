import { format } from "date-fns";
import { tz } from "@date-fns/tz";

import { cn } from "@/lib/utils";
import { useCalendarContext } from "./calendar-context";
import {
  getCalendarEventDisplay,
  isCalendarEventPast,
} from "./calendar-event-display";
import { getCalendarEventAppearanceClasses } from "./calendar-tailwind-classes";
import type { CalendarEvent } from "./calendar-types";
import { CalendarProviderMark } from "./calendar-provider-mark";

export function CalendarAgendaEvent({
  event,
  showDate = false,
  className,
}: {
  event: CalendarEvent;
  showDate?: boolean;
  className?: string;
}) {
  const {
    displayTimeZone,
    isStudent,
    setManageEventDialogOpen,
    setSelectedEvent,
  } = useCalendarContext();
  const dateContext = { in: tz(displayTimeZone) };
  const { primaryLabel, secondaryLabel, gradeLabel } = getCalendarEventDisplay(
    event,
    { showGrade: !isStudent },
  );
  const isPast = isCalendarEventPast(event);
  const appearance = getCalendarEventAppearanceClasses({
    color: event.color,
    sessionType: event.sessionType,
    status: event.status,
    isPast,
  });
  const timeLabel = `${format(event.start, "h:mm a", dateContext)}–${format(event.end, "h:mm a", dateContext)}`;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 flex-col rounded-md border-l-4 px-2.5 py-2 text-left transition-colors",
        appearance.event,
        className,
      )}
      onClick={() => {
        setSelectedEvent(event);
        setManageEventDialogOpen(true);
      }}
    >
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-1">
          <span className="line-clamp-2 min-w-0 text-xs font-semibold leading-tight">
            {primaryLabel}
          </span>
          <CalendarProviderMark
            sessionType={event.sessionType}
            isPast={isPast}
            className="mt-0.5 size-3 shrink-0"
          />
        </span>
        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
          {timeLabel}
        </span>
      </span>
      {gradeLabel && (
        <span className="mt-1 truncate text-[10px] font-semibold uppercase text-muted-foreground">
          {gradeLabel}
        </span>
      )}
      {secondaryLabel && (
        <span className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
          {secondaryLabel}
        </span>
      )}
      {showDate && (
        <span className="mt-1 text-[10px] text-muted-foreground/80">
          {format(event.start, "EEE, MMM d", dateContext)}
        </span>
      )}
    </button>
  );
}
