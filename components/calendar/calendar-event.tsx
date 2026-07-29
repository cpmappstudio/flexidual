import { CalendarEvent as CalendarEventType } from "@/components/calendar/calendar-types";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { format, isSameMonth } from "date-fns";
import { tz } from "@date-fns/tz";
import { cn } from "@/lib/utils";
import { motion, MotionConfig, AnimatePresence } from "framer-motion";
import { Video, PlayCircle } from "lucide-react";
import { getCalendarColorClasses } from "@/components/calendar/calendar-tailwind-classes";
import {
  CalendarTimeScale,
  getTimeScaleUnitsAt,
} from "@/components/calendar/calendar-time-scale";
import { getCalendarEventDisplay } from "@/components/calendar/calendar-event-display";

interface EventPosition {
  left: string;
  width: string;
  top: string;
  height: string;
}

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getOverlappingEvents(
  currentEvent: CalendarEventType,
  events: CalendarEventType[],
): CalendarEventType[] {
  return events.filter((event) => {
    if (event.id === currentEvent.id) return false;
    return (
      currentEvent.start < event.end &&
      currentEvent.end > event.start &&
      isSameCalendarDay(currentEvent.start, event.start)
    );
  });
}

function calculateEventPosition(
  event: CalendarEventType,
  allEvents: CalendarEventType[],
  scheduleStartMinutes: number,
  scheduleEndMinutes: number,
  timeScale?: CalendarTimeScale,
): EventPosition {
  const overlappingEvents = getOverlappingEvents(event, allEvents);
  const group = [event, ...overlappingEvents].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const position = group.indexOf(event);
  const width = `${100 / (overlappingEvents.length + 1)}%`;
  const left = `${(position * 100) / (overlappingEvents.length + 1)}%`;

  const startHour = event.start.getHours();
  const startMinutes = event.start.getMinutes();

  let endHour = event.end.getHours();
  let endMinutes = event.end.getMinutes();

  if (!isSameCalendarDay(event.start, event.end)) {
    endHour = 23;
    endMinutes = 59;
  }

  const eventStartMinutes = startHour * 60 + startMinutes;
  const eventEndMinutes = endHour * 60 + endMinutes;
  const visibleStart = Math.max(eventStartMinutes, scheduleStartMinutes);
  const visibleEnd = Math.min(eventEndMinutes, scheduleEndMinutes);
  const duration = Math.max(0, visibleEnd - visibleStart);
  const topUnits = timeScale
    ? getTimeScaleUnitsAt(timeScale, visibleStart)
    : (visibleStart - scheduleStartMinutes) / 60;
  const heightUnits = timeScale
    ? getTimeScaleUnitsAt(timeScale, visibleEnd) - topUnits
    : duration / 60;

  return {
    left,
    width,
    top: `calc(var(--calendar-hour-height) * ${topUnits})`,
    height: `calc(var(--calendar-hour-height) * ${heightUnits})`,
  };
}

export default function CalendarEvent({
  event,
  month = false,
  className,
  timeScale,
  compact = false,
  floatingTime = false,
  contentClassName,
}: {
  event: CalendarEventType;
  month?: boolean;
  className?: string;
  timeScale?: CalendarTimeScale;
  compact?: boolean;
  floatingTime?: boolean;
  contentClassName?: string;
}) {
  const {
    events,
    setSelectedEvent,
    setManageEventDialogOpen,
    date,
    scheduleStartMinutes,
    scheduleEndMinutes,
    displayTimeZone,
  } = useCalendarContext();

  const style = month
    ? {}
    : calculateEventPosition(
        event,
        events,
        scheduleStartMinutes,
        scheduleEndMinutes,
        timeScale,
      );

  const dateContext = { in: tz(displayTimeZone) };
  const isEventInCurrentMonth = isSameMonth(event.start, date, dateContext);
  const animationKey = `${event.id}-${
    isEventInCurrentMonth ? "current" : "adjacent"
  }`;

  const isPast = event.end.getTime() < Date.now();

  const statusColor =
    event.status === "active"
      ? "green"
      : event.status === "completed" || isPast
        ? "gray"
        : event.status === "cancelled"
          ? "red"
          : event.color;
  const statusClasses = getCalendarColorClasses(statusColor);

  const { primaryLabel, secondaryLabel } = getCalendarEventDisplay(event);
  const timeLabel = `${format(event.start, "h:mm a", dateContext)} - ${format(event.end, "h:mm a", dateContext)}`;
  const compactTimeLabel = `${format(event.start, "h:mm", dateContext)}-${format(event.end, "h:mm a", dateContext)}`;
  const tooltipText = month
    ? `${primaryLabel}${secondaryLabel ? ` - ${secondaryLabel}` : ""} - ${format(event.start, "h:mm a", dateContext)} · ${displayTimeZone}`
    : `${primaryLabel}\n${timeLabel}${secondaryLabel ? `\n${secondaryLabel}` : ""} · ${displayTimeZone}`;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          title={tooltipText}
          className={cn(
            "cursor-pointer truncate rounded-md border px-2 py-1 transition-all duration-300",
            compact && "px-1.5 py-1",
            statusClasses.event,
            !month && "absolute",
            className,
          )}
          style={style}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedEvent(event);
            setManageEventDialogOpen(true);
          }}
          initial={{
            opacity: 0,
            y: -3,
            scale: 0.98,
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            scale: 0.98,
            transition: {
              duration: 0.15,
              ease: "easeOut",
            },
          }}
          transition={{
            duration: 0.2,
            ease: [0.25, 0.1, 0.25, 1],
            opacity: {
              duration: 0.2,
              ease: "linear",
            },
            layout: {
              duration: 0.2,
              ease: "easeOut",
            },
          }}
          layoutId={`event-${animationKey}-${month ? "month" : "day"}`}
        >
          <motion.div
            className={cn(
              "relative flex w-full flex-col",
              statusClasses.text,
              month && "flex-row items-center justify-between gap-2",
            )}
            layout="position"
          >
            <div
              className={cn(
                "flex min-w-0 flex-col gap-0.5 overflow-hidden",
                floatingTime && "pr-24",
                compact && "gap-0",
                month && "flex-row items-center gap-1 flex-1 min-w-0",
                contentClassName,
              )}
            >
              <p
                className={cn(
                  "truncate text-[13px] font-semibold leading-tight",
                  compact &&
                    "line-clamp-2 whitespace-normal text-[10px] leading-[1.05]",
                  month && "text-[10px]",
                )}
              >
                {primaryLabel}
              </p>

              {!month && secondaryLabel && (
                <p
                  className={cn(
                    "truncate text-[11px] font-medium leading-tight opacity-80",
                    compact && "text-[9px] leading-[1.05]",
                  )}
                >
                  {secondaryLabel}
                </p>
              )}

              {!month && !floatingTime && (
                <p
                  className={cn(
                    "truncate text-[10px] font-normal leading-tight opacity-70",
                    compact && "text-[8px] leading-[1.05]",
                  )}
                >
                  {timeLabel}
                </p>
              )}

              {event.isLive && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium leading-tight">
                  <Video className="h-3 w-3" />
                  <span>Live Now</span>
                </div>
              )}
              {event.hasRecording && !event.isLive && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium leading-tight">
                  <PlayCircle className="h-3 w-3" />
                  <span>Recording</span>
                </div>
              )}
            </div>

            {!month && floatingTime && (
              <p className="absolute right-0 top-0 whitespace-nowrap text-right text-[8px] font-medium leading-none opacity-70">
                {compactTimeLabel}
              </p>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
