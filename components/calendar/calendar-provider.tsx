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
  calendarIconIsToday?: boolean;
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
  calendarIconIsToday = true,
  isLoading = false,
  userId,
  selectedTeacherId,
  onTeacherChange,
  selectedCurriculumId,
  onCurriculumChange,
  children,
}: CalendarProviderProps) {
  // Dialog States
  const [newEventDialogOpen, setNewEventDialogOpen] = useState(false);
  const [manageEventDialogOpen, setManageEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  
  // FIXED: Use proper Id type instead of string
  const [preselectedLessonId, setPreselectedLessonId] = useState<Id<"lessons"> | null>(null);

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
        calendarIconIsToday,
        isLoading,
        userId,

        // Dialog Management
        newEventDialogOpen,
        setNewEventDialogOpen,
        manageEventDialogOpen,
        setManageEventDialogOpen,
        selectedEvent,
        setSelectedEvent,

        // Scheduling Shortcut
        preselectedLessonId,
        setPreselectedLessonId,
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