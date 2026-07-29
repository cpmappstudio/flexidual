import {
  addCivilDays,
  getUtcDayRange,
  isValidCivilDate,
  isValidTimeZone,
} from "./time-zone";

export type CalendarScopeType = "institution" | "campus";

type CalendarTimeZoneInput = {
  scopeType: CalendarScopeType;
  institutionTimeZone?: string;
  campusTimeZone?: string;
  isStudent: boolean;
  browserTimeZone?: string;
};

export type CalendarTimeZoneContext = {
  schedulingTimeZone?: string;
  displayTimeZone?: string;
  isUsingLocalTime: boolean;
};

export type CalendarRangeMode = "day" | "week" | "month";

function validTimeZone(timeZone?: string) {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : undefined;
}

function getCivilDayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function startOfCivilWeek(date: string) {
  const daysFromMonday = (getCivilDayOfWeek(date) + 6) % 7;
  return addCivilDays(date, -daysFromMonday);
}

function getMonthBounds(date: string) {
  const [year, month] = date.split("-").map(Number);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

export function getCalendarUtcRange(
  date: string,
  mode: CalendarRangeMode,
  timeZone: string,
) {
  if (!isValidCivilDate(date)) throw new Error("INVALID_CIVIL_DATE");

  let startDate = date;
  let endDate = addCivilDays(date, 1);

  if (mode === "week") {
    startDate = startOfCivilWeek(date);
    endDate = addCivilDays(startDate, 7);
  }

  if (mode === "month") {
    const month = getMonthBounds(date);
    startDate = startOfCivilWeek(month.start);
    endDate = addCivilDays(startOfCivilWeek(addCivilDays(month.end, -1)), 7);
  }

  return {
    from: getUtcDayRange(startDate, timeZone).from,
    to: getUtcDayRange(endDate, timeZone).from,
    startDate,
    endDate,
  };
}

export function resolveCalendarTimeZones({
  scopeType,
  institutionTimeZone,
  campusTimeZone,
  isStudent,
  browserTimeZone,
}: CalendarTimeZoneInput): CalendarTimeZoneContext {
  const institutionZone = validTimeZone(institutionTimeZone);
  const campusZone = validTimeZone(campusTimeZone);
  const schedulingTimeZone =
    scopeType === "campus" ? (campusZone ?? institutionZone) : institutionZone;
  const localZone = isStudent ? validTimeZone(browserTimeZone) : undefined;
  const displayTimeZone = localZone ?? schedulingTimeZone;

  return {
    schedulingTimeZone,
    displayTimeZone,
    isUsingLocalTime: Boolean(localZone) && localZone !== schedulingTimeZone,
  };
}
