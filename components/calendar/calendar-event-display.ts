import { CalendarEvent } from "./calendar-types";

export function getCalendarEventDisplay(
  event: Pick<
    CalendarEvent,
    | "className"
    | "curriculumTitle"
    | "title"
    | "sessionType"
    | "teacherName"
    | "gradeLabel"
    | "gradeCode"
  >,
  options?: { showGrade?: boolean; includeGradeInPrimary?: boolean },
) {
  const platformLabel =
    event.sessionType === "ignitia"
      ? "Ignitia"
      : event.sessionType === "abeka"
        ? "Abeka"
        : null;
  const gradeLabel = event.gradeLabel ?? event.gradeCode ?? null;
  const primaryLabel = event.className || event.curriculumTitle || event.title;

  return {
    primaryLabel:
      options?.showGrade && options.includeGradeInPrimary && gradeLabel
        ? `${primaryLabel} (${gradeLabel})`
        : primaryLabel,
    secondaryLabel: event.teacherName ?? platformLabel,
    gradeLabel: options?.showGrade ? gradeLabel : null,
  };
}
