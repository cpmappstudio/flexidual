"use client";

import { useState } from "react";
import { CalendarContext } from "./calendar-context";
import { CalendarEvent, Mode } from "./calendar-types";
import { Id } from "@/convex/_generated/dataModel";

interface CalendarProviderProps {
  events: CalendarEvent[];
  setEvents: (events: CalendarEvent[]) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  date: Date;
  setDate: (date: Date) => void;

  isLoading?: boolean;
  userId?: Id<"users">;
  selectedTeacherId: Id<"users"> | null;
  onTeacherChange: (id: Id<"users"> | null) => void;
  selectedCurriculumId: Id<"curriculums"> | null;
  onCurriculumChange: (id: Id<"curriculums"> | null) => void;
  children: React.ReactNode;
}

export default function CalendarProvider({
  events,
  setEvents,
  mode,
  setMode,
  date,
  setDate,

  isLoading = false,
  userId,
  selectedTeacherId,
  onTeacherChange,
  selectedCurriculumId,
  onCurriculumChange,
  children,
}: CalendarProviderProps) {

  const [manageEventDialogOpen, setManageEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  return (
    <CalendarContext.Provider
      value={{
        // Pass through all original props
        events,
        setEvents,
        mode,
        setMode,
        date,
        setDate,

        isLoading,
        userId,

        // Dialog Management
        manageEventDialogOpen,
        setManageEventDialogOpen,
        selectedEvent,
        setSelectedEvent,

        selectedTeacherId,
        onTeacherChange,
        selectedCurriculumId,
        onCurriculumChange,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}