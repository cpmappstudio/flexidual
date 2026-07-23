import type { CalendarEventColor } from '@/presentation/components/calendar/types';

export const CALENDAR_EVENT_COLOR_CLASSES: Record<CalendarEventColor, string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 [&_.event-dot]:fill-blue-600',
  green: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200 [&_.event-dot]:fill-green-600',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200 [&_.event-dot]:fill-red-600',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200 [&_.event-dot]:fill-yellow-600',
  purple: 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200 [&_.event-dot]:fill-purple-600',
  orange: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200 [&_.event-dot]:fill-orange-600',
  gray: 'border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 [&_.event-dot]:fill-zinc-600',
};

export const CALENDAR_EVENT_COLOR_BAR_CLASSES: Record<CalendarEventColor, string> = {
  blue: 'bg-blue-600',
  green: 'bg-green-600',
  red: 'bg-red-600',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-600',
  orange: 'bg-orange-500',
  gray: 'bg-zinc-500',
};
