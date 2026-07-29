"use client";

import { useMemo, useState } from "react";
import { CalendarContext } from "./calendar-context";
import { CalendarEvent, Mode } from "./calendar-types";
import { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "@/lib/academic-settings";

interface CalendarProviderProps {
  events: CalendarEvent[];
  mode: Mode;
  setMode: (mode: Mode) => void;
  date: Date;
  setDate: (date: Date) => void;
  scheduleStartMinutes?: number;
  scheduleEndMinutes?: number;
  schedulingTimeZone: string;
  displayTimeZone: string;
  isUsingLocalTime: boolean;
  isStudent?: boolean;

  isLoading?: boolean;
  userId?: Id<"users">;
  children: React.ReactNode;
}

export default function CalendarProvider({
  events,
  mode,
  setMode,
  date,
  setDate,
  scheduleStartMinutes = DEFAULT_SCHEDULE_START_MINUTES,
  scheduleEndMinutes = DEFAULT_SCHEDULE_END_MINUTES,
  schedulingTimeZone,
  displayTimeZone,
  isUsingLocalTime,
  isStudent = false,

  isLoading = false,
  userId,
  children,
}: CalendarProviderProps) {
  const [manageEventDialogOpen, setManageEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const visibleScheduleWindow = useMemo(() => {
    const eventStartMinutes = events.map(
      (event) => event.start.getHours() * 60 + event.start.getMinutes(),
    );
    const eventEndMinutes = events.map((event) => {
      const endsOnAnotherDay =
        event.end.getFullYear() !== event.start.getFullYear() ||
        event.end.getMonth() !== event.start.getMonth() ||
        event.end.getDate() !== event.start.getDate();
      if (endsOnAnotherDay) return 24 * 60;
      return event.end.getHours() * 60 + event.end.getMinutes();
    });
    return {
      start: Math.min(
        scheduleStartMinutes,
        ...eventStartMinutes.map((minutes) => Math.floor(minutes / 60) * 60),
      ),
      end: Math.max(
        scheduleEndMinutes,
        ...eventEndMinutes.map((minutes) => Math.ceil(minutes / 60) * 60),
      ),
    };
  }, [events, scheduleEndMinutes, scheduleStartMinutes]);

  return (
    <CalendarContext.Provider
      value={{
        // Pass through all original props
        events,
        mode,
        setMode,
        date,
        setDate,
        scheduleStartMinutes: visibleScheduleWindow.start,
        scheduleEndMinutes: visibleScheduleWindow.end,
        schedulingTimeZone,
        displayTimeZone,
        isUsingLocalTime,
        isStudent,

        isLoading,
        userId,

        // Dialog Management
        manageEventDialogOpen,
        setManageEventDialogOpen,
        selectedEvent,
        setSelectedEvent,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}
