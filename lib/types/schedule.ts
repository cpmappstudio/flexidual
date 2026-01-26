export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly";

export interface RecurrenceConfig {
  type: RecurrenceType;
  daysOfWeek?: number[];
  endDate?: number;
  occurrences?: number;
}