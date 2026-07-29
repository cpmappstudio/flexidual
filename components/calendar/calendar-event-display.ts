import { CalendarEvent } from "./calendar-types";

export function getCalendarEventDisplay(
  event: Pick<
    CalendarEvent,
    "className" | "curriculumTitle" | "title" | "sessionType" | "teacherName"
  >,
) {
  const platformLabel =
    event.sessionType === "ignitia"
      ? "Ignitia"
      : event.sessionType === "abeka"
        ? "Abeka"
        : null;

  return {
    primaryLabel: event.className || event.curriculumTitle || event.title,
    secondaryLabel: event.teacherName ?? platformLabel,
  };
}
