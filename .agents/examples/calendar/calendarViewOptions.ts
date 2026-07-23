'use client';

import { CalendarRange, Columns, Grid2x2, List } from 'lucide-react';
import type { ElementType } from 'react';

import type { CalendarView } from '@/presentation/components/calendar/types';

export interface CalendarViewOption {
  value: CalendarView;
  label: string;
  icon: ElementType;
}

export const CALENDAR_VIEW_OPTIONS: ReadonlyArray<CalendarViewOption> = [
  { value: 'day', label: 'Ver por dia', icon: List },
  { value: 'week', label: 'Ver por semana', icon: Columns },
  { value: 'month', label: 'Ver por mes', icon: Grid2x2 },
  { value: 'agenda', label: 'Ver agenda', icon: CalendarRange },
];
