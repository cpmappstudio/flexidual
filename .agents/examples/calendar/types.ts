export type CalendarView = 'day' | 'week' | 'month' | 'agenda';
export type CalendarEventColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'orange' | 'gray';
export type CalendarBadgeVariant = 'dot' | 'colored' | 'mixed';
export type CalendarRecurrence = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type CalendarCustomRecurrenceUnit = 'day' | 'week' | 'month' | 'year';
export type CalendarMonthlyPattern = 'first-day' | 'first-weekday';
export type CalendarRecurrenceEndMode = 'never' | 'date' | 'occurrences';

export interface CalendarRecurrenceRule {
  repeatEvery: number;
  unit: CalendarCustomRecurrenceUnit;
  weeklyDays?: number[];
  monthlyPattern?: CalendarMonthlyPattern;
  excludedDates?: string[];
  end: {
    mode: CalendarRecurrenceEndMode;
    date?: string;
    occurrences?: number;
  };
}

export interface CalendarUser {
  id: string;
  name: string;
  picturePath?: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  color: CalendarEventColor;
  user: CalendarUser;
  location?: string;
  seriesId?: string;
  occurrenceKey?: string;
  recurrence?: CalendarRecurrence;
  recurrenceRule?: CalendarRecurrenceRule;
}

export interface CalendarCell {
  day: number;
  currentMonth: boolean;
  date: Date;
}

export interface CalendarWorkingHours {
  [weekday: number]: {
    from: number;
    to: number;
  };
}

export interface CalendarVisibleHours {
  from: number;
  to: number;
}

