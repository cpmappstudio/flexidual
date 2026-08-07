const STUDENT_JOIN_WINDOW_MS = 5 * 60 * 1000;

type CalendarEventActionInput = {
  isStudent: boolean;
  now: number;
  start: number;
  end: number;
  status: "scheduled" | "active" | "completed" | "cancelled";
  isLive: boolean;
  hasRecording?: boolean;
  roomName?: string;
};

export type CalendarEventPrimaryAction =
  | "watch-recording"
  | "go-to-classroom"
  | "enter-live"
  | "prepare-room"
  | null;

export function getCalendarEventPrimaryAction({
  isStudent,
  now,
  start,
  end,
  status,
  isLive,
  hasRecording,
  roomName,
}: CalendarEventActionInput): CalendarEventPrimaryAction {
  if (status === "cancelled" || !roomName) return null;
  if (isLive) return isStudent ? "go-to-classroom" : "enter-live";
  if (end <= now) return hasRecording ? "watch-recording" : null;

  if (isStudent) {
    const canEnter =
      isLive || status === "active" || now >= start - STUDENT_JOIN_WINDOW_MS;
    return canEnter ? "go-to-classroom" : null;
  }

  return "prepare-room";
}
