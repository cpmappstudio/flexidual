'use client';

import { CalendarX2, MapPin, Repeat2, User } from 'lucide-react';
import { endOfDay, format, isSameMonth, parseISO, startOfDay } from 'date-fns';

import { cn } from '@/lib/utils';
import { CALENDAR_EVENT_COLOR_BAR_CLASSES } from '@/presentation/components/calendar/eventColorClasses';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface CalendarAgendaViewProps {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}

export function CalendarAgendaView({ singleDayEvents, multiDayEvents }: CalendarAgendaViewProps) {
  const { selectedDate, openEventDetails } = useEventCalendar();
  const groups = new Map<string, { date: Date; events: CalendarEvent[] }>();

  const addEventForDate = (date: Date, event: CalendarEvent) => {
    if (!isSameMonth(date, selectedDate)) return;
    const key = format(date, 'yyyy-MM-dd');
    const group = groups.get(key) ?? { date: startOfDay(date), events: [] };
    group.events.push(event);
    groups.set(key, group);
  };

  singleDayEvents.forEach((event) => addEventForDate(parseISO(event.startDate), event));
  multiDayEvents.forEach((event) => {
    let currentDate = startOfDay(parseISO(event.startDate));
    const lastDate = endOfDay(parseISO(event.endDate));

    while (currentDate <= lastDate) {
      addEventForDate(currentDate, event);
      currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
    }
  });

  const dayGroups = Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="h-full overflow-auto bg-white dark:bg-zinc-900">
      <div className="space-y-6 p-4">
        {dayGroups.map((group) => (
          <section key={group.date.toISOString()} className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)]">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{format(group.date, 'EEEE')}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{format(group.date, 'MMM d, yyyy')}</p>
            </div>
            <div className="space-y-2">
              {group.events.map((event) => (
                <button
                  key={`${event.id}-${group.date.toISOString()}`}
                  type="button"
                  onClick={() => openEventDetails(event)}
                  className={cn(
                    'relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 pl-5 text-left shadow-sm transition hover:border-[#2F6D7C]/40 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('absolute inset-y-0 left-0 w-1.5', CALENDAR_EVENT_COLOR_BAR_CLASSES[event.color])}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{event.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{event.description || 'Sin descripcion'}</p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {format(parseISO(event.startDate), 'h:mm a')} - {format(parseISO(event.endDate), 'h:mm a')}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <User className="size-3.5" />
                      {event.user.name}
                    </span>
                    {event.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" />
                        {event.location}
                      </span>
                    )}
                    {event.recurrence && event.recurrence !== 'none' && (
                      <span className="inline-flex items-center gap-1">
                        <Repeat2 className="size-3.5" />
                        Recurrente
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}

        {dayGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-zinc-500 dark:text-zinc-400">
            <CalendarX2 className="size-10" />
            <p className="text-sm md:text-base">No hay actas programadas para este mes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
