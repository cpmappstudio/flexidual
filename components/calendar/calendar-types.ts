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

export type ClassCalendarEvent = {
  kind: "class";
  id: string;
  _id: Id<"classSchedule">;

  // Core scheduling info
  scheduleId: Id<"classSchedule">;
  classId: Id<"classes">;
  curriculumId: Id<"curriculums">;
  teacherId?: Id<"users">;
  teacherIds?: Id<"users">[];
  isAssignedTeacher?: boolean;
  gradeCodes?: string[];
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
  canLeadSession: boolean;
  sessionStartedAt?: number;
  sessionReopenUntil?: number;
  sessionEndedAt?: number;
  sessionEndedByName?: string;
  sessionEndedAutomatically: boolean;
  sessionClosing?: boolean;
  sessionCloseRetrying?: boolean;

  // Recordings
  hasRecording?: boolean;
};

export type InstitutionalCalendarEvent = {
  kind: "event";
  id: string;
  eventId: Id<"events">;
  schoolId: Id<"schools">;
  occurrenceId: Id<"eventOccurrences">;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  actualStart: number;
  actualEnd: number;
  timeZone: string;
  color: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
  isLive: boolean;
  sessionType: "live";
  roomName: string;
  gradeCodes?: string[];
  gradeLabel?: string;
  teacherIds: Id<"users">[];
  responsibleName: string;
  campusId?: Id<"campuses">;
  campusName?: string;
  canManage: boolean;
  canEdit: boolean;
  canCancelOccurrence: boolean;
  cancellationReason?: string;
};

export type CalendarEvent = ClassCalendarEvent | InstitutionalCalendarEvent;

export const calendarModes = ["month", "week", "day"] as const;
export type Mode = (typeof calendarModes)[number];
