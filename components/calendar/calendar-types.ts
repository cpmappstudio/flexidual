import type { Id } from "@/convex/_generated/dataModel";

export type CalendarProps = {
  events: CalendarEvent[]
  setEvents: (events: CalendarEvent[]) => void
  mode: Mode
  setMode: (mode: Mode) => void
  date: Date
  setDate: (date: Date) => void
  calendarIconIsToday?: boolean
  isLoading?: boolean
  userId?: Id<"users">
}

export type CalendarContextType = CalendarProps & {
  newEventDialogOpen: boolean
  setNewEventDialogOpen: (open: boolean) => void
  manageEventDialogOpen: boolean
  setManageEventDialogOpen: (open: boolean) => void
  selectedEvent: CalendarEvent | null
  setSelectedEvent: (event: CalendarEvent | null) => void
  preselectedLessonId: Id<"lessons"> | null
  setPreselectedLessonId: (id: Id<"lessons"> | null) => void
  refetchEvents?: () => void
  selectedTeacherId: Id<"users"> | null
  onTeacherChange: (id: Id<"users"> | null) => void
  selectedCurriculumId: Id<"curriculums"> | null
  onCurriculumChange: (id: Id<"curriculums"> | null) => void
}

export type CalendarEvent = {
  id: string
  _id: Id<"classSchedule">
  
  // Core scheduling info
  scheduleId: Id<"classSchedule">
  lessonId?: Id<"lessons">
  classId: Id<"classes">
  curriculumId: Id<"curriculums">
  sessionType: "live" | "ignitia"
  
  // Display fields
  title: string
  description?: string
  start: Date
  end: Date
  color: string
  
  // Class/Curriculum context
  className: string
  curriculumTitle: string
  
  // LiveKit room info
  roomName?: string
  isLive: boolean
  
  // Status
  status: "scheduled" | "active" | "completed" | "cancelled"

  // Recurrence
  isRecurring?: boolean
  recurrenceRule?: string
  recurrenceParentId?: Id<"classSchedule">
  teacherName?: string
  teacherImageUrl?: string
}

// For scheduling new lessons
export type SchedulableClass = {
  _id: Id<"classes">
  name: string
  curriculumId: Id<"curriculums">
  curriculumTitle: string
  curriculumCode?: string
  color: string
  teacherId: Id<"users">
  lessons: {
    _id: Id<"lessons">
    title: string
    description?: string
    order: number
    isScheduled?: boolean // If this lesson already has a schedule
  }[]
}

export const calendarModes = ['day', 'week', 'month'] as const
export type Mode = (typeof calendarModes)[number]