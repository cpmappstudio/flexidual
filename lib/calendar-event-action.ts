import type { ClassSessionType } from "./class-session";
import { isExternalClassSession } from "./class-session";
import {
  canReopenLiveSession,
  canStartLiveSession,
} from "./live-session-policy";

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
  canLeadSession?: boolean;
  sessionStartedAt?: number;
  sessionReopenUntil?: number;
};

export type CalendarEventPrimaryAction =
  | "watch-recording"
  | "go-to-classroom"
  | "enter-live"
  | "start-live"
  | "reopen-live"
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
  canLeadSession = false,
  sessionStartedAt,
  sessionReopenUntil,
}: CalendarEventActionInput): CalendarEventPrimaryAction {
  if (status === "cancelled") return null;
  if (isExternalClassSession(sessionType)) return "open-external";
  if (!roomName) return null;
  if (isLive) return isStudent ? "go-to-classroom" : "enter-live";
  if (
    !isStudent &&
    canLeadSession &&
    canReopenLiveSession({
      now,
      scheduledStart: start,
      scheduledEnd: end,
      status,
      isLive,
      sessionStartedAt,
      sessionReopenUntil,
    })
  ) {
    return "reopen-live";
  }
  if (end <= now || status === "completed") {
    return hasRecording ? "watch-recording" : null;
  }
  if (
    !isStudent &&
    canLeadSession &&
    canStartLiveSession({
      now,
      scheduledStart: start,
      scheduledEnd: end,
      status,
      isLive,
      sessionStartedAt,
      sessionReopenUntil,
    })
  ) {
    return "start-live";
  }
  return null;
}
