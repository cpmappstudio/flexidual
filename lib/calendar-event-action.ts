import type { ClassSessionType } from "./class-session";
import { isExternalClassSession } from "./class-session";

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
  sessionType?: ClassSessionType;
};

export type CalendarEventPrimaryAction =
  | "watch-recording"
  | "go-to-classroom"
  | "enter-live"
  | "prepare-room"
  | "open-external"
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
  sessionType,
}: CalendarEventActionInput): CalendarEventPrimaryAction {
  if (status === "cancelled") return null;
  if (isExternalClassSession(sessionType)) return "open-external";
  if (!roomName) return null;
  if (isLive) return isStudent ? "go-to-classroom" : "enter-live";
  if (end <= now) return hasRecording ? "watch-recording" : null;

  if (isStudent) {
    const canEnter =
      isLive || status === "active" || now >= start - STUDENT_JOIN_WINDOW_MS;
    return canEnter ? "go-to-classroom" : null;
  }

  return "prepare-room";
}
