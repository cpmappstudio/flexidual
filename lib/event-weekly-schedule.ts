import { addCivilDays, civilDayNumber, isValidCivilDate } from "./time-zone";

export const MAX_EVENT_WEEKS = 60;

function timeMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function firstWeeklyDate(startDate: string, days: number[]) {
  if (!isValidCivilDate(startDate) || !days.length) return null;
  const startDay = new Date(civilDayNumber(startDate) * 86_400_000).getUTCDay();
  const offset = Math.min(...days.map((day) => (day - startDay + 7) % 7));
  return addCivilDays(startDate, offset);
}

export function formatWeeklyDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function weeklyEndTime(startTime: string, durationMinutes: number) {
  const start = timeMinutes(startTime);
  if (start === null || !Number.isInteger(durationMinutes)) return "";
  const end = (start + durationMinutes) % 1440;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function weeklyDuration(startTime: string, endTime: string) {
  const start = timeMinutes(startTime);
  const end = timeMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}
