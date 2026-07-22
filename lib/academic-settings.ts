export const DEFAULT_SCHEDULE_START_MINUTES = 7 * 60;
export const DEFAULT_SCHEDULE_END_MINUTES = 18 * 60;
export const SCHEDULE_STEP_MINUTES = 15;

export function isValidScheduleWindow(startMinutes: number, endMinutes: number) {
  return (
    Number.isInteger(startMinutes) &&
    Number.isInteger(endMinutes) &&
    startMinutes >= 0 &&
    endMinutes <= 24 * 60 &&
    startMinutes < endMinutes &&
    startMinutes % SCHEDULE_STEP_MINUTES === 0 &&
    endMinutes % SCHEDULE_STEP_MINUTES === 0
  );
}
