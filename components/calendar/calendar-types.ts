import type { Id } from "@/convex/_generated/dataModel";

export type CalendarContextType = {
  events: CalendarEvent[];
  mode: Mode;
  setMode: (mode: Mode) => void;
  date: Date;
  setDate: (date: Date) => void;
  scheduleStartMinutes: number;
  scheduleEndMinutes: number;
  schedulingTimeZone: string;
  displayTimeZone: string;
  isUsingLocalTime: boolean;
  isStudent?: boolean;

  isLoading?: boolean;
  userId?: Id<"users">;

  manageEventDialogOpen: boolean;
  setManageEventDialogOpen: (open: boolean) => void;
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
};

export type CalendarEvent = {
  id: string;
  _id: Id<"classSchedule">;

  // Core scheduling info
  scheduleId: Id<"classSchedule">;
  classId: Id<"classes">;
  curriculumId: Id<"curriculums">;
  teacherId?: Id<"users">;
  gradeCode?: string;
  gradeLabel?: string;
  sessionType: "live" | "ignitia" | "abeka";

  // Display fields
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
  color: string;

  // Class/Curriculum context
  className: string;
  curriculumTitle: string;

  // LiveKit room info
  roomName?: string;
  isLive: boolean;

  // Status
  status: "scheduled" | "active" | "completed" | "cancelled";

  // Recurrence
  isRecurring?: boolean;
  recurrenceRule?: string;
  recurrenceParentId?: Id<"classSchedule">;
  cancellationReason?: string;
  teacherName?: string;
  teacherImageUrl?: string;

  // Recordings
  hasRecording?: boolean;
};

export const calendarModes = ["month", "week", "day"] as const;
export type Mode = (typeof calendarModes)[number];
