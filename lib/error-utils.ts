import { ConvexError } from "convex/values";

interface ConvexErrorData {
  code: string;
  className?: string;
  curriculumTitle?: string;
  conflictTime?: string;
  grades?: string;
}

export function parseConvexError(error: unknown): ConvexErrorData | null {
  // Check if it's a ConvexError
  if (error instanceof ConvexError) {
    const data = error.data;

    // If data is already an object with a code property, return it directly
    if (typeof data === "object" && data !== null && "code" in data) {
      return data as ConvexErrorData;
    }

    // If data is a string, check for known error codes
    if (typeof data === "string") {
      const knownCodes = [
        "CLASS_NOT_FOUND",
        "PERMISSION_DENIED",
        "INVALID_STUDENT",
        "INVALID_STUDENTS",
        "STUDENT_ALREADY_ENROLLED",
        "CURRICULUM_CODE_IN_USE",
        "INVALID_CURRICULUM_TITLE",
        "COURSE_CLASS_OVERLAP",
        "CHAT_MUTED",
      ];
      const code = knownCodes.find((knownCode) => data.includes(knownCode));
      if (code) return { code };
      if (data.includes("same curriculum")) {
        return { code: "CURRICULUM_CONFLICT" };
      }
    }
  }

  return null;
}

/**
 * Format a timestamp to local time string
 * @param timestamp - Unix timestamp in milliseconds
 * @param locale - User's locale (e.g., 'en-US', 'es-CO', 'pt-BR')
 * @returns Formatted date-time string in user's local timezone
 */
export function formatLocalDateTime(
  timestamp: number,
  locale: string = "en-US",
): string {
  const date = new Date(timestamp);

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    // This will use the user's browser timezone automatically
  }).format(date);
}

export function getErrorMessage(
  error: ConvexErrorData,
  t: (key: string, values?: Record<string, string>) => string,
  locale?: string,
): string {
  switch (error.code) {
    case "CURRICULUM_CONFLICT":
      return t("errors.curriculumConflict", {
        className: error.className || "",
        curriculumTitle: error.curriculumTitle || "",
      });
    case "CLASS_SCHEDULE_CONFLICT":
      return t("errors.classScheduleConflict", {
        className: error.className || "",
        conflictTime: error.conflictTime
          ? formatLocalDateTime(Number(error.conflictTime), locale)
          : "",
      });
    case "TEACHER_SCHEDULE_CONFLICT":
      return t("errors.teacherScheduleConflict", {
        className: error.className || "",
        conflictTime: error.conflictTime
          ? formatLocalDateTime(Number(error.conflictTime), locale)
          : "",
      });
    case "COURSE_CLASS_OVERLAP":
      return t("class.classTimeOverlap");
    case "CLASS_NOT_FOUND":
      return t("errors.classNotFound");
    case "PERMISSION_DENIED":
      return t("errors.permissionDenied");
    case "INVALID_STUDENT":
      return t("errors.invalidStudent");
    case "INVALID_STUDENTS":
      return t("errors.invalidStudents");
    case "STUDENT_ALREADY_ENROLLED":
      return t("errors.studentAlreadyEnrolled");
    case "INVALID_GRADE":
      return t("errors.invalidGrade", {
        grades: error.grades || "Unknown",
      });
    case "CURRICULUM_CODE_IN_USE":
      return t("errors.curriculumCodeInUse");
    case "INVALID_CURRICULUM_TITLE":
      return t("errors.invalidCurriculumTitle");
    default:
      return t("errors.operationFailed");
  }
}
