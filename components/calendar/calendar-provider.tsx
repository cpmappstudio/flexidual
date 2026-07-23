"use client";

import { useState } from "react";
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

  isLoading = false,
  userId,
  children,
}: CalendarProviderProps) {
  const [manageEventDialogOpen, setManageEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );

  return (
    <CalendarContext.Provider
      value={{
        // Pass through all original props
        events,
        mode,
        setMode,
        date,
        setDate,
        scheduleStartMinutes,
        scheduleEndMinutes,

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
