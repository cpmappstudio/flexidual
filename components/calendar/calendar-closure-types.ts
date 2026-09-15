import type { Id } from "@/convex/_generated/dataModel";

export type CalendarClosureSummary = {
  _id: Id<"calendarClosures">;
  campusId?: Id<"campuses">;
  gradeCode?: string;
  localDate: string;
  timeZone: string;
  startsAt: number;
  endsAt: number;
  isAllDay: boolean;
  reason: string;
  status: "processing" | "completed";
  selectedCount: number;
  cancelledCount: number;
  skippedCount: number;
};
