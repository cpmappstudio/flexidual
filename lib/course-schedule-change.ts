import {
  civilDayNumber,
  localDateTimeToUtc,
  toCivilDate,
  utcToLocalDateTime,
} from "./time-zone";

export type WeeklyScheduleSlot = {
  dayOfWeek: number;
  startMinutes: number;
  durationMinutes: number;
  sessionType: string;
};

export function weeklyScheduleSlotKey(slot: WeeklyScheduleSlot) {
  return [
    slot.dayOfWeek,
    slot.startMinutes,
    slot.durationMinutes,
    slot.sessionType,
  ].join(":");
}

export function getRemovedWeeklyScheduleSlots<T extends WeeklyScheduleSlot>(
  previous: T[],
  next: WeeklyScheduleSlot[],
) {
  const nextKeys = new Set(next.map(weeklyScheduleSlotKey));
  return previous.filter((slot) => !nextKeys.has(weeklyScheduleSlotKey(slot)));
}

export function requiresWeeklySlotRemovalConfirmation({
  slot,
  originalSlots,
  periodStartDate,
  timeZone,
  isEditing,
  now,
}: {
  slot: WeeklyScheduleSlot;
  originalSlots: WeeklyScheduleSlot[];
  periodStartDate?: string | number;
  timeZone?: string;
  isEditing: boolean;
  now?: number;
}) {
  if (!isEditing || periodStartDate === undefined || !timeZone) return false;
  if (!hasAcademicPeriodStarted(periodStartDate, timeZone, now)) return false;
  const slotKey = weeklyScheduleSlotKey(slot);
  return originalSlots.some(
    (originalSlot) => weeklyScheduleSlotKey(originalSlot) === slotKey,
  );
}

export function hasAcademicPeriodStarted(
  startDate: string | number,
  timeZone: string,
  now = Date.now(),
) {
  return now >= localDateTimeToUtc(`${toCivilDate(startDate)}T00:00`, timeZone);
}

export function scheduleMatchesWeeklySlot(
  schedule: {
    scheduledStart: number;
    scheduledEnd: number;
    sessionType?: string;
  },
  slot: WeeklyScheduleSlot,
  timeZone: string,
) {
  const localStart = utcToLocalDateTime(schedule.scheduledStart, timeZone);
  const date = localStart.slice(0, 10);
  const dayOfWeek = new Date(civilDayNumber(date) * 86_400_000).getUTCDay();
  const startMinutes =
    Number(localStart.slice(11, 13)) * 60 + Number(localStart.slice(14, 16));

  return (
    dayOfWeek === slot.dayOfWeek &&
    startMinutes === slot.startMinutes &&
    Math.round((schedule.scheduledEnd - schedule.scheduledStart) / 60_000) ===
      slot.durationMinutes &&
    (schedule.sessionType ?? "live") === slot.sessionType
  );
}

export function scheduleOccurrenceKey(schedule: {
  scheduledStart: number;
  scheduledEnd: number;
  sessionType?: string;
}) {
  return [
    schedule.scheduledStart,
    schedule.scheduledEnd - schedule.scheduledStart,
    schedule.sessionType ?? "live",
  ].join(":");
}
