'use client';

import { Calendar as CalendarIcon, Clock, User } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';

import {
  getCurrentEvents,
  getEventBlockStyle,
  getVisibleHours,
  groupOverlappingEvents,
  hasEventOverlap,
} from '@/lib/calendar';
import { Calendar } from '@/presentation/components/ui/calendar';
import { ScrollArea } from '@/presentation/components/ui/scroll-area';
import { CalendarTimeGrid } from '@/presentation/components/calendar/CalendarTimeGrid';
import { CalendarTimeline } from '@/presentation/components/calendar/CalendarTimeline';
import { DayViewMultiDayEventsRow } from '@/presentation/components/calendar/DayViewMultiDayEventsRow';
import { EventBlock } from '@/presentation/components/calendar/EventBlock';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface CalendarDayViewProps {
  singleDayEvents: CalendarEvent[];
  multiDayEvents: CalendarEvent[];
}

export function CalendarDayView({ singleDayEvents, multiDayEvents }: CalendarDayViewProps) {
  const { selectedDate, goToDay, visibleHours } = useEventCalendar();
  const { hours, earliestEventHour, latestEventHour } = getVisibleHours(visibleHours, singleDayEvents);
  const currentEvents = getCurrentEvents(singleDayEvents);

  const dayEvents = singleDayEvents.filter((event) => {
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate);

    return isSameDay(start, selectedDate) || isSameDay(end, selectedDate);
  });

  const groupedEvents = groupOverlappingEvents(dayEvents);

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-zinc-900">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div>
          <DayViewMultiDayEventsRow selectedDate={selectedDate} multiDayEvents={multiDayEvents} />

          <div className="relative z-20 flex border-b border-zinc-200 dark:border-zinc-800">
            <div className="w-[4.5rem]" />
            <span className="flex-1 border-l border-zinc-200 py-2 text-center text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {format(selectedDate, 'EEE')} <span className="font-semibold text-zinc-900 dark:text-zinc-100">{format(selectedDate, 'd')}</span>
            </span>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1" type="always">
          <div className="flex">
            <div className="relative w-[4.5rem] shrink-0">
              {hours.map((hour, index) => (
                <div key={hour} className="relative h-24">
                  <div className="absolute -top-3 right-2 flex h-6 items-center">
                    {index !== 0 && <span className="text-xs text-zinc-500 dark:text-zinc-400">{format(new Date().setHours(hour, 0, 0, 0), 'hh a')}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative flex-1 border-l border-zinc-200 dark:border-zinc-800">
              <CalendarTimeGrid day={selectedDate} hours={hours} showHourLabels={false}>
                {groupedEvents.map((group, groupIndex) =>
                  group.map((event) => {
                    let style = getEventBlockStyle(event, selectedDate, groupIndex, groupedEvents.length, {
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

              <CalendarTimeline firstVisibleHour={earliestEventHour} lastVisibleHour={latestEventHour} />
            </div>
          </div>
        </ScrollArea>
      </div>

      <aside className="hidden w-64 divide-y divide-zinc-200 border-l border-zinc-200 md:block">
        <Calendar
          className="mx-auto w-fit"
          classNames={{
            day_button: 'data-[selected-single=true]:!bg-[#2F6D7C] data-[selected-single=true]:!text-white data-[selected-single=true]:hover:!bg-[#2F6D7C]',
            selected: 'rounded-md',
            today: 'bg-[#2F6D7C]/10 text-[#2F6D7C] rounded-md data-[selected=true]:bg-[#2F6D7C] data-[selected=true]:text-white',
          }}
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) goToDay(date);
          }}
          initialFocus
        />

        <div className="flex-1 space-y-3">
          {currentEvents.length > 0 ? (
            <div className="flex items-start gap-2 px-4 pt-4">
              <span className="relative mt-[5px] flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-green-600" />
              </span>

              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Actas en curso</p>
            </div>
          ) : (
            <p className="p-4 text-center text-sm italic text-zinc-500 dark:text-zinc-400">
              No hay actas o reuniones en curso
            </p>
          )}

          {currentEvents.length > 0 && (
            <ScrollArea className="h-[422px] px-4" type="always">
              <div className="space-y-6 pb-4">
                {currentEvents.map((event) => (
                  <div key={event.id} className="space-y-1.5">
                    <p className="line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{event.title}</p>

                    <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                      <User className="size-3.5" />
                      <span className="text-sm">{event.user.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                      <CalendarIcon className="size-3.5" />
                      <span className="text-sm">{format(parseISO(event.startDate), 'MMM d, yyyy')}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                      <Clock className="size-3.5" />
                      <span className="text-sm">
                        {format(parseISO(event.startDate), 'h:mm a')} - {format(parseISO(event.endDate), 'h:mm a')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </aside>
    </div>
  );
}
