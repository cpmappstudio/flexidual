import { CalendarEvent as CalendarEventType } from "@/components/calendar/calendar-types";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { format, isSameDay, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, MotionConfig, AnimatePresence } from "framer-motion";
import { Video } from "lucide-react";

interface EventPosition {
  left: string;
  width: string;
  top: string;
  height: string;
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
      isSameDay(currentEvent.start, event.start)
    );
  });
}

function calculateEventPosition(
  event: CalendarEventType,
  allEvents: CalendarEventType[],
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

  if (!isSameDay(event.start, event.end)) {
    endHour = 23;
    endMinutes = 59;
  }

  const topPosition = startHour * 128 + (startMinutes / 60) * 128;
  const duration = endHour * 60 + endMinutes - (startHour * 60 + startMinutes);
  const height = (duration / 60) * 128;

  return {
    left,
    width,
    top: `${topPosition}px`,
    height: `${height}px`,
  };
}

export default function CalendarEvent({
  event,
  month = false,
  className,
}: {
  event: CalendarEventType;
  month?: boolean;
  className?: string;
}) {
  const { events, setSelectedEvent, setManageEventDialogOpen, date } =
    useCalendarContext();
  const style = month ? {} : calculateEventPosition(event, events);

  // Generate a unique key that includes the current month to prevent animation conflicts
  const isEventInCurrentMonth = isSameMonth(event.start, date);
  const animationKey = `${event.id}-${
    isEventInCurrentMonth ? "current" : "adjacent"
  }`;

  // Get status badge color
  const statusColor = 
    event.status === "active" ? "green" :
    event.status === "completed" ? "gray" :
    event.status === "cancelled" ? "red" :
    event.color.replace("#", ""); // Default to curriculum color

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          className={cn(
            `px-3 py-1.5 rounded-md truncate cursor-pointer transition-all duration-300`,
            `bg-${statusColor}-500/10 hover:bg-${statusColor}-500/20 border border-${statusColor}-500`,
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
              `flex flex-col w-full text-${statusColor}-500`,
              month && "flex-row items-center justify-between",
            )}
            layout="position"
          >
            <div
              className={cn(
                "flex flex-col",
                month && "flex-row items-center gap-1",
              )}
            >
              {/* Curriculum Title */}
              <p className={cn("font-bold truncate", month && "text-xs")}>
                {event.curriculumTitle}
              </p>
              
              {/* Lesson Title */}
              <p
                className={cn(
                  "text-sm truncate",
                  month && "hidden",
                  !month && "font-medium",
                )}
              >
                {event.title}
              </p>
              
              {/* Class Name */}
              <p
                className={cn(
                  "text-sm truncate",
                  month && "hidden",
                  !month && "font-medium",
                )}
              >
                {event.className}
              </p>

              {/* Live Indicator */}
              {event.isLive && (
                <div className="flex items-center gap-1 text-xs font-medium">
                  <Video className="h-3 w-3" />
                  <span>Live Now</span>
                </div>
              )}
            </div>
            
            {/* Time */}
            <p className={cn("text-sm", month && "text-xs")}>
              <span>{format(event.start, "h:mm a")}</span>
              <span className={cn("mx-1", month && "hidden")}>-</span>
              <span className={cn(month && "hidden")}>
                {format(event.end, "h:mm a")}
              </span>
            </p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}