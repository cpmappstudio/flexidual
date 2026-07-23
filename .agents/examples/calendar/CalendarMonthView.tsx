'use client';

import { useMemo } from 'react';
import { isToday, startOfDay } from 'date-fns';

import { cn } from '@/lib/utils';
import {
  calculateMonthEventPositions,
  getCalendarCells,
  getMonthCellEvents,
} from '@/lib/calendar';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';
import { DroppableDayCell } from '@/presentation/components/calendar/dnd/DroppableDayCell';
import { MonthEventBadge } from '@/presentation/components/calendar/MonthEventBadge';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

const WEEK_DAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MAX_VISIBLE_EVENTS = 3;

interface CalendarMonthViewProps {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}

export function CalendarMonthView({ singleDayEvents, multiDayEvents }: CalendarMonthViewProps) {
  const { selectedDate, goToDay, openCreateDialog } = useEventCalendar();
  const allEvents = [...multiDayEvents, ...singleDayEvents];
  const cells = useMemo(() => getCalendarCells(selectedDate), [selectedDate]);
  const eventPositions = useMemo(
    () => calculateMonthEventPositions(multiDayEvents, singleDayEvents, selectedDate),
    [multiDayEvents, singleDayEvents, selectedDate],
  );

  const weekCount = Math.ceil(cells.length / 7);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-zinc-900">
      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
        {WEEK_DAYS.map((day) => (
          <div key={day} className="flex items-center justify-center py-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{day}</span>
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7 overflow-hidden border-b border-r border-zinc-200 dark:border-zinc-800"
        style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
      >
        {cells.map((cell) => {
          const cellEvents = getMonthCellEvents(cell.date, allEvents, eventPositions);

          return (
            <DroppableDayCell key={cell.date.toISOString()} cell={cell}>
              <div
                className={cn(
                  'flex h-full min-h-0 flex-col gap-1 border-l border-t border-zinc-200 bg-white px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900',
                  !cell.currentMonth && 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500',
                )}
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => goToDay(cell.date)}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800',
                      isToday(cell.date) && 'bg-[#2F6D7C] text-white hover:bg-[#2F6D7C]',
                    )}
                  >
                    {cell.day}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreateDialog(cell.date)}
                    className="hidden rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:block"
                  >
                    +
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                  {cellEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
                    <MonthEventBadge key={`${event.id}-${startOfDay(cell.date).toISOString()}`} event={event} cellDate={cell.date} />
                  ))}
                </div>

                {cellEvents.length > MAX_VISIBLE_EVENTS && (
                  <button
                    type="button"
                    onClick={() => goToDay(cell.date)}
                    className="text-left text-xs font-semibold text-zinc-500 hover:text-[#2F6D7C] dark:text-zinc-400"
                  >
                    +{cellEvents.length - MAX_VISIBLE_EVENTS} mas
                  </button>
                )}
              </div>
            </DroppableDayCell>
          );
        })}
      </div>
    </div>
  );
}
