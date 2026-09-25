import {
  addCivilDays,
  civilDayNumber,
  dateInTimeZone,
  localDateTimeToUtc,
  utcToLocalDateTime,
} from "../time-zone";

export type AbekaSchedule = {
  mode: "manual" | "weekdays" | "weekly";
  time: string;
  weekday: number;
  stopAtPeriodEnd: boolean;
};

export function defaultAbekaSchedule(
  timestamp: number,
  timeZone: string,
): AbekaSchedule {
  const local = utcToLocalDateTime(timestamp, timeZone);
  return {
    mode: "weekly",
    time: local.slice(11),
    weekday: new Date(
      civilDayNumber(local.slice(0, 10)) * 86_400_000,
    ).getUTCDay(),
    stopAtPeriodEnd: true,
  };
}

export function nextAbekaSync(
  schedule: AbekaSchedule,
  timeZone: string,
  now: number,
  period?: { startDate: string; endDate: string } | null,
): number | undefined {
  if (schedule.mode === "manual" || (schedule.stopAtPeriodEnd && !period))
    return;
  const today = dateInTimeZone(now, timeZone);
  const start =
    schedule.stopAtPeriodEnd && period && period.startDate > today
      ? period.startDate
      : today;
  // ponytail: at most two weeks, including one skipped DST-gap occurrence.
  for (let offset = 0; offset < 15; offset++) {
    const day = addCivilDays(start, offset);
    if (schedule.stopAtPeriodEnd && period && day > period.endDate) return;
    const weekday = new Date(civilDayNumber(day) * 86_400_000).getUTCDay();
    if (
      schedule.mode === "weekdays"
        ? weekday === 0 || weekday === 6
        : weekday !== schedule.weekday
    )
      continue;
    let candidate: number;
    try {
      candidate = localDateTimeToUtc(`${day}T${schedule.time}`, timeZone);
    } catch (error) {
      // A local time that does not exist on a DST transition is skipped, not duplicated.
      if (error instanceof Error && error.message === "INVALID_LOCAL_DATE_TIME")
        continue;
      throw error;
    }
    if (candidate > now) return candidate;
  }
}
