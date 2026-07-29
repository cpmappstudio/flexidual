import { motion, type PanInfo } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCalendarContext } from "../calendar-context";
import {
  getHorizontalSwipeStep,
  shiftCalendarDate,
} from "../calendar-navigation";
import CalendarBodyDay from "./day/calendar-body-day";
import CalendarBodyWeek from "./week/calendar-body-week";
import CalendarBodyMonth from "./month/calendar-body-month";

export default function CalendarBody() {
  const { mode, date, setDate } = useCalendarContext();
  const isMobile = useIsMobile();

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    const step = getHorizontalSwipeStep(
      { x: 0, y: 0 },
      { x: info.offset.x, y: info.offset.y },
    );

    if (step) setDate(shiftCalendarDate(date, mode, step));
  };

  return (
    <motion.div
      className="h-full min-h-0"
      drag={isMobile ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.14}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      {mode === "day" && <CalendarBodyDay />}
      {mode === "week" && <CalendarBodyWeek />}
      {mode === "month" && <CalendarBodyMonth />}
    </motion.div>
  );
}
