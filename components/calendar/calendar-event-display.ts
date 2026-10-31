import {
  CalendarEvent,
  ClassCalendarEvent,
  InstitutionalCalendarEvent,
} from "./calendar-types";

export function isCalendarEventPast(
  event: Pick<CalendarEvent, "end" | "isLive">,
  now = Date.now(),
) {
  return !event.isLive && event.end.getTime() < now;
}

export function getCalendarEventIndicators(
  event: { hasRecording?: boolean; isLive: boolean },
  isPast: boolean,
) {
  const showRecording = isPast && Boolean(event.hasRecording) && !event.isLive;

  return {
    showRecording,
    showProviderIdentity: !showRecording,
  };
}

export function getCalendarEventDisplay(
  event:
    | (Pick<
        ClassCalendarEvent,
        | "className"
        | "curriculumTitle"
        | "title"
        | "sessionType"
        | "teacherName"
        | "gradeLabel"
        | "gradeCode"
      > & { kind?: "class" })
    | Pick<
        InstitutionalCalendarEvent,
        "kind" | "title" | "responsibleName" | "gradeLabel"
      >,
  options?: { showGrade?: boolean; includeGradeInPrimary?: boolean },
) {
  if (event.kind === "event") {
    const gradeLabel = event.gradeLabel ?? null;
    return {
      primaryLabel:
        options?.showGrade && options.includeGradeInPrimary && gradeLabel
          ? `${event.title} (${gradeLabel})`
          : event.title,
      secondaryLabel: event.responsibleName,
      gradeLabel: options?.showGrade ? gradeLabel : null,
    };
  }
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
    secondaryLabel:
      event.teacherName && event.teacherName !== "Unknown"
        ? event.teacherName
        : platformLabel,
    gradeLabel: options?.showGrade ? gradeLabel : null,
  };
}
