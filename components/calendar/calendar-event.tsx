import { CalendarEvent as CalendarEventType } from "@/components/calendar/calendar-types";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { format, isSameDay, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, MotionConfig, AnimatePresence } from "framer-motion";
import { Video } from "lucide-react";
import { useEffect, useState } from "react";

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

// Get responsive hour height based on screen size
function getHourHeight(): number {
  if (typeof window === 'undefined') return 64;
  
  const width = window.innerWidth;
  if (width >= 1536) return 96;  // 2xl: 24 (6rem)
  if (width >= 1280) return 80;  // xl: 20 (5rem)
  return 64;                      // default: 16 (4rem)
}

function calculateEventPosition(
  event: CalendarEventType,
  allEvents: CalendarEventType[],
  hourHeight: number,
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

  const topPosition = startHour * hourHeight + (startMinutes / 60) * hourHeight;
  const duration = endHour * 60 + endMinutes - (startHour * 60 + startMinutes);
  const height = (duration / 60) * hourHeight;

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
  
  const [hourHeight, setHourHeight] = useState(getHourHeight());

  // Update hour height on window resize
  useEffect(() => {
    const handleResize = () => {
      setHourHeight(getHourHeight());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const style = month ? {} : calculateEventPosition(event, events, hourHeight);

  const isEventInCurrentMonth = isSameMonth(event.start, date);
  const animationKey = `${event.id}-${
    isEventInCurrentMonth ? "current" : "adjacent"
  }`;

  const statusColor = 
    event.status === "active" ? "green" :
    event.status === "completed" ? "gray" :
    event.status === "cancelled" ? "red" :
    event.color.replace("#", "");

  const tooltipText = month 
    ? `${event.className} - ${format(event.start, "h:mm a")}`
    : `${event.className}\n${event.title}\n${event.curriculumTitle}\n${format(event.start, "h:mm a")} - ${format(event.end, "h:mm a")}`;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          title={tooltipText}
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
              month && "flex-row items-center justify-between gap-2",
            )}
            layout="position"
          >
            <div
              className={cn(
                "flex flex-col",
                month && "flex-row items-center gap-1 flex-1 min-w-0",
              )}
            >
              <p className={cn("font-bold truncate", month && "text-xs")}>
                {event.className}
              </p>
              
              <p
                className={cn(
                  "text-sm truncate font-medium",
                  month && "hidden",
                )}
              >
                {event.title}
              </p>
              
              <p
                className={cn(
                  "text-xs truncate opacity-80",
                  month && "hidden",
                )}
              >
                {event.curriculumTitle}
              </p>

              {event.isLive && (
                <div className="flex items-center gap-1 text-xs font-medium mt-1">
                  <Video className="h-3 w-3" />
                  <span>Live Now</span>
                </div>
              )}
            </div>
            
            <p className={cn("text-sm", month && "text-xs flex-shrink-0")}>
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