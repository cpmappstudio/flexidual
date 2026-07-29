const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function getZonedParts(timestamp: number, timeZone: string) {
  const parts = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const { year, month, day, hour, minute } = parts;
  if ([year, month, day, hour, minute].some(Number.isNaN)) {
    throw new Error("INVALID_LOCAL_DATE_TIME");
  }
  return { year, month, day, hour, minute };
}

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
  const intendedTimestamp = Date.UTC(year, month - 1, day, hour, minute);
  const intendedDate = new Date(intendedTimestamp);
  if (
    intendedDate.getUTCFullYear() !== year ||
    intendedDate.getUTCMonth() !== month - 1 ||
    intendedDate.getUTCDate() !== day ||
    intendedDate.getUTCHours() !== hour ||
    intendedDate.getUTCMinutes() !== minute
  ) {
    throw new Error("INVALID_LOCAL_DATE_TIME");
  }

  let timestamp = intendedTimestamp;
  for (let attempt = 0; attempt < 4; attempt++) {
    const zoned = getZonedParts(timestamp, timeZone);
    const renderedTimestamp = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
    );
    const adjustment = intendedTimestamp - renderedTimestamp;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }

  const result = getZonedParts(timestamp, timeZone);
  if (
    result.year !== year ||
    result.month !== month ||
    result.day !== day ||
    result.hour !== hour ||
    result.minute !== minute
  ) {
    throw new Error("INVALID_LOCAL_DATE_TIME");
  }
  return timestamp;
}

export function utcToLocalDateTime(timestamp: number, timeZone: string) {
  const date = getZonedParts(timestamp, timeZone);
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}T${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}`;
}

export function todayInTimeZone(timeZone: string) {
  return utcToLocalDateTime(Date.now(), timeZone).slice(0, 10);
}

export function dateInTimeZone(timestamp: number, timeZone: string) {
  return utcToLocalDateTime(timestamp, timeZone).slice(0, 10);
}

export function getUtcDayRange(date: string, timeZone: string) {
  if (!isValidCivilDate(date)) throw new Error("INVALID_CIVIL_DATE");
  return {
    from: localDateTimeToUtc(`${date}T00:00`, timeZone),
    to: localDateTimeToUtc(`${addCivilDays(date, 1)}T00:00`, timeZone),
  };
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
