import type { Id } from "@/convex/_generated/dataModel";

type CalendarCancellationInput = {
  canManageSeries: boolean;
  currentUserId?: Id<"users">;
  teacherId?: Id<"users">;
  status: "scheduled" | "active" | "completed" | "cancelled";
  start: number;
  now: number;
  isLive: boolean;
  isRecurring: boolean;
};

export function getCalendarCancellationCapabilities({
  canManageSeries,
  currentUserId,
  teacherId,
  status,
  start,
  now,
  isLive,
  isRecurring,
}: CalendarCancellationInput) {
  const canCancelScheduledClass =
    status === "scheduled" && start > now && !isLive;
  const isAssignedTeacher =
    currentUserId !== undefined && currentUserId === teacherId;

  return {
    canCancelOccurrence:
      canCancelScheduledClass && (canManageSeries || isAssignedTeacher),
    canCancelSeries: canCancelScheduledClass && canManageSeries && isRecurring,
  };
}
