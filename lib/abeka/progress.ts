import { z } from "zod";

export const REPORT_URL =
  "https://atschool.abeka.com/Account/Streaming/StreamingDetails.aspx";
export const DETAIL_URL =
  "https://atschool.abeka.com/Account/Streaming/StreamingDetailsProgress.aspx";

export class ProbeError extends Error {}

const duration = z.string().regex(/^\d+ Mins [0-5]?\d Secs$/);
const identifier = z.string().regex(/^\d*$/);
const lessonSchema = z.object({
  SessionName: z.string().min(1),
  LessonDisplayName: z.string().regex(/^Lesson [1-9]\d*$/),
  PercentDisplay: z.string().regex(/^\d+(\.\d+)?%$/),
  SegmentId: identifier,
  SubscriptionItem: identifier,
  SubscriptionNumber: identifier,
  LessonLengthDisplay: duration,
  LessonProgressDisplay: duration,
  Completed: z.enum(["Yes", "No"]),
  LastViewed: z.string(),
});

function seconds(value: string) {
  const [minutes, remainder] = value.match(/\d+/g)!.map(Number);
  const result = minutes * 60 + remainder;
  if (!Number.isSafeInteger(result)) throw new ProbeError("Duración inválida.");
  return result;
}

function date(value: string) {
  if (value === "(not viewed)") return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new ProbeError("Fecha inválida.");
  const [, month, day, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    throw new ProbeError("Fecha inválida.");
  return iso;
}

function parseLesson(raw: unknown) {
  if (typeof raw !== "string")
    throw new ProbeError("Formato de lección inesperado.");
  const value = lessonSchema.parse(JSON.parse(raw));
  const percentage = Number(value.PercentDisplay.slice(0, -1));
  const lessonNumber = Number(value.LessonDisplayName.slice(7));
  if (percentage > 100 || !Number.isSafeInteger(lessonNumber))
    throw new ProbeError("Número o porcentaje de lección inválido.");
  return {
    subjectName: value.SessionName,
    lessonNumber,
    percentage,
    completed: value.Completed === "Yes",
    lengthSeconds: seconds(value.LessonLengthDisplay),
    watchedSeconds: seconds(value.LessonProgressDisplay),
    lastViewed: date(value.LastViewed),
    segmentId: value.SegmentId || null,
    subscriptionItem: value.SubscriptionItem || null,
    subscriptionNumber: value.SubscriptionNumber || null,
  };
}

export function parseProgress(payload: unknown) {
  try {
    const envelope = z
      .object({ d: z.array(z.unknown()).min(1).max(500) })
      .parse(payload);
    const rows = envelope.d
      .map(parseLesson)
      .sort((a, b) => a.lessonNumber - b.lessonNumber);
    // SessionName can label an optional lesson; the requested subjectId owns the report.
    if (new Set(rows.map((row) => row.lessonNumber)).size !== rows.length)
      throw new ProbeError("Lecciones duplicadas.");
    return rows;
  } catch {
    // Do not expose response bodies or student data in diagnostic logs.
    throw new ProbeError(
      "Respuesta de progreso vacía o incompatible; no se importó nada.",
    );
  }
}

export function parseSavedProgress(text: string) {
  try {
    const payload: unknown = JSON.parse(text);
    return parseProgress(
      typeof payload === "string" ? JSON.parse(payload) : payload,
    );
  } catch {
    throw new ProbeError(
      "El archivo de muestra no contiene una respuesta válida.",
    );
  }
}

export class AuthenticationRequired extends ProbeError {}

export function summarize(rows: ReturnType<typeof parseProgress>) {
  return {
    lessons: rows.length,
    completed: rows.filter((row) => row.completed).length,
    partial: rows.filter((row) => !row.completed && row.percentage > 0).length,
    unviewed: rows.filter((row) => row.lastViewed === null).length,
  };
}
