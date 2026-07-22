import { TZDateMini } from "@date-fns/tz";

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone.includes("/") || timeZone === "UTC";
  } catch {
    return false;
  }
}

export function toCivilDate(value: string | number) {
  return typeof value === "string"
    ? value
    : new Date(value).toISOString().slice(0, 10);
}

export function isValidCivilDate(value: string) {
  const match = CIVIL_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function civilDayNumber(value: string) {
  const match = CIVIL_DATE.exec(value);
  if (!match || !isValidCivilDate(value)) throw new Error("INVALID_CIVIL_DATE");
  const [, year, month, day] = match.map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function addCivilDays(value: string, days: number) {
  const date = new Date((civilDayNumber(value) + days) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function localDateTimeToUtc(value: string, timeZone: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match || !isValidTimeZone(timeZone)) {
    throw new Error("INVALID_LOCAL_DATE_TIME");
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  const zoned = new TZDateMini(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0,
    timeZone,
  );

  if (
    zoned.getFullYear() !== year ||
    zoned.getMonth() !== month - 1 ||
    zoned.getDate() !== day ||
    zoned.getHours() !== hour ||
    zoned.getMinutes() !== minute
  ) {
    throw new Error("INVALID_LOCAL_DATE_TIME");
  }
  return zoned.getTime();
}

export function utcToLocalDateTime(timestamp: number, timeZone: string) {
  const date = new TZDateMini(timestamp, timeZone);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function todayInTimeZone(timeZone: string) {
  return utcToLocalDateTime(Date.now(), timeZone).slice(0, 10);
}

export function shiftZonedDateTime(
  timestamp: number,
  timeZone: string,
  days: number,
  hour: number,
  minute: number,
) {
  const localDate = utcToLocalDateTime(timestamp, timeZone).slice(0, 10);
  return localDateTimeToUtc(
    `${addCivilDays(localDate, days)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timeZone,
  );
}

export function getWeeklyOccurrenceStarts({
  startDate,
  endDate,
  timeZone,
  dayOfWeek,
  startMinutes,
  limit,
}: {
  startDate: string;
  endDate: string;
  timeZone: string;
  dayOfWeek: number;
  startMinutes: number;
  limit: number;
}) {
  const firstDay = civilDayNumber(startDate);
  const daysToFirst =
    (dayOfWeek - new Date(firstDay * 86_400_000).getUTCDay() + 7) % 7;
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const starts: number[] = [];

  for (
    let date = addCivilDays(startDate, daysToFirst);
    date <= endDate && starts.length < limit;
    date = addCivilDays(date, 7)
  ) {
    starts.push(
      localDateTimeToUtc(
        `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        timeZone,
      ),
    );
  }
  return starts;
}
