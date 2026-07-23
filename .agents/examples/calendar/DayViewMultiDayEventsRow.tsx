'use client';

import { differenceInDays, endOfDay, isWithinInterval, parseISO, startOfDay } from 'date-fns';

import { MonthEventBadge } from '@/presentation/components/calendar/MonthEventBadge';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface DayViewMultiDayEventsRowProps {
  selectedDate: Date;
  multiDayEvents: CalendarEvent[];
}

export function DayViewMultiDayEventsRow({ selectedDate, multiDayEvents }: DayViewMultiDayEventsRowProps) {
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const multiDayEventsInDay = multiDayEvents
    .filter((event) => {
      const eventStart = parseISO(event.startDate);
      const eventEnd = parseISO(event.endDate);

      return (
        isWithinInterval(dayStart, { start: eventStart, end: eventEnd }) ||
        isWithinInterval(dayEnd, { start: eventStart, end: eventEnd }) ||
        (eventStart <= dayStart && eventEnd >= dayEnd)
      );
    })
    .sort((a, b) => {
      const durationA = differenceInDays(parseISO(a.endDate), parseISO(a.startDate));
      const durationB = differenceInDays(parseISO(b.endDate), parseISO(b.startDate));
      return durationB - durationA;
    });

  if (multiDayEventsInDay.length === 0) return null;

  return (
    <div className="flex border-b border-zinc-200 dark:border-zinc-800">
      <div className="w-[4.5rem]" />
      <div className="flex flex-1 flex-col gap-1 border-l border-zinc-200 py-1 dark:border-zinc-800">
        {multiDayEventsInDay.map((event) => (
          <MonthEventBadge key={event.id} event={event} cellDate={selectedDate} />
        ))}
      </div>
    </div>
  );
}
