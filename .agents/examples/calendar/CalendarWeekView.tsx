'use client';

import { addDays, areIntervalsOverlapping, format, isSameDay, isToday, parseISO, startOfWeek } from 'date-fns';

import {
  getEventBlockStyle,
  getVisibleHours,
  groupOverlappingEvents,
  hasEventOverlap,
} from '@/lib/calendar';
import { cn } from '@/lib/utils';
import { EventBlock } from '@/presentation/components/calendar/EventBlock';
import { CalendarTimeGrid } from '@/presentation/components/calendar/CalendarTimeGrid';
import { CalendarTimeline } from '@/presentation/components/calendar/CalendarTimeline';
import { ScrollArea } from '@/presentation/components/ui/scroll-area';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface CalendarWeekViewProps {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}

export function CalendarWeekView({ singleDayEvents, multiDayEvents }: CalendarWeekViewProps) {
  const { selectedDate, visibleHours, goToDay, setView } = useEventCalendar();
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const { hours, earliestEventHour, latestEventHour } = getVisibleHours(visibleHours, singleDayEvents);

  return (
    <div className="h-full min-h-0 bg-white dark:bg-zinc-900">
      <div className="flex flex-col items-center justify-center border-b border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:hidden">
        <p>La vista semanal no esta disponible en pantallas pequenas.</p>
        <button
          type="button"
          onClick={() => setView('day')}
          className="mt-2 rounded-md border border-zinc-200 px-3 py-1 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cambiar a dia
        </button>
      </div>

      <div className="hidden h-full min-h-0 flex-col sm:flex">
        {multiDayEvents.length > 0 && (
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            <div className="w-[4.5rem] shrink-0 px-2 py-2 text-right text-xs text-zinc-500 dark:text-zinc-400">Todo el dia</div>
            <div className="grid flex-1 grid-cols-7 divide-x divide-zinc-200 border-l border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {weekDays.map((day) => {
                const dayEvents = multiDayEvents.filter((event) =>
                  areIntervalsOverlapping(
                    { start: parseISO(event.startDate), end: parseISO(event.endDate) },
                    {
                      start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0),
                      end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59),
                    },
                  ),
                );

                return (
                  <div key={day.toISOString()} className="min-h-10 space-y-1 p-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <EventBlock key={event.id} event={event} compact />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          <div className="w-[4.5rem] shrink-0" />
          <div className="grid flex-1 grid-cols-7 divide-x divide-zinc-200 border-l border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {weekDays.map((day) => {
              const isCurrentDay = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => goToDay(day)}
                  className="inline-flex items-center justify-center gap-1 py-2 text-center text-xs font-medium text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  <span>{format(day, 'EEE')}</span>
                  <span
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-full font-semibold text-zinc-900 dark:text-zinc-100',
                      isCurrentDay && 'bg-[#2F6D7C] text-white dark:bg-[#B9E4E8] dark:text-[#2E7B8C]',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1" type="always">
          <div className="flex min-h-full overflow-hidden">
            <div className="relative w-[4.5rem] shrink-0">
              {hours.map((hour, index) => (
                <div key={hour} className="relative h-24">
                  <div className="absolute -top-3 right-2 flex h-6 items-center">
                    {index !== 0 && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative flex-1 border-l border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-7 divide-x divide-zinc-200 dark:divide-zinc-800">
                {weekDays.map((day) => {
                  const dayEvents = singleDayEvents.filter((event) => isSameDay(parseISO(event.startDate), day) || isSameDay(parseISO(event.endDate), day));
                  const groupedEvents = groupOverlappingEvents(dayEvents);

                  return (
                    <div key={day.toISOString()} className="relative">
                      <CalendarTimeGrid day={day} hours={hours} showHourLabels={false}>
                        {groupedEvents.map((group, groupIndex) =>
                          group.map((event) => {
                            let style = getEventBlockStyle(event, day, groupIndex, groupedEvents.length, {
                              from: earliestEventHour,
                              to: latestEventHour,
                            });

                            if (!hasEventOverlap(event, groupIndex, groupedEvents)) {
                              style = { ...style, width: '100%', left: '0%' };
                            }

                            return (
                              <div key={event.id} className="absolute p-1" style={style}>
                                <EventBlock event={event} />
                              </div>
                            );
                          }),
                        )}
                      </CalendarTimeGrid>
                    </div>
                  );
                })}
              </div>

              <CalendarTimeline firstVisibleHour={earliestEventHour} lastVisibleHour={latestEventHour} />
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
