'use client';

import { useMemo } from 'react';

import { expandRecurringEventsForView, filterEventsForView, splitEventsByDuration } from '@/lib/calendar';
import { CalendarAgendaView } from '@/presentation/components/calendar/CalendarAgendaView';
import { CalendarDayView } from '@/presentation/components/calendar/CalendarDayView';
import { CalendarDndProvider } from '@/presentation/components/calendar/dnd/CalendarDndProvider';
import { CalendarHeader } from '@/presentation/components/calendar/CalendarHeader';
import { CalendarMonthView } from '@/presentation/components/calendar/CalendarMonthView';
import { CalendarWeekView } from '@/presentation/components/calendar/CalendarWeekView';
import { EventCalendarProvider } from '@/presentation/context/EventCalendarContext';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';

import type {
  CalendarEvent,
  CalendarView,
} from '@/presentation/components/calendar/types';

interface EventCalendarProps {
  events: CalendarEvent[];
  initialView?: CalendarView;
  view?: CalendarView;
  viewStorageKey?: string;
  searchTerm?: string;
  onRequestCreateEvent?: (startDate?: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  onViewChange?: (view: CalendarView) => void;
  onEventMove?: (event: CalendarEvent, startDate: string, endDate: string) => void;
  showHeaderViewSwitcher?: boolean;
}

interface EventCalendarContentProps {
  searchTerm?: string;
  showHeaderViewSwitcher?: boolean;
}

function eventMatchesSearch(event: CalendarEvent, searchTerm: string) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) return true;

  return [
    event.title,
    event.description,
    event.location,
    event.user.name,
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function EventCalendarContent({
  searchTerm = '',
  showHeaderViewSwitcher = true,
}: EventCalendarContentProps) {
  const { events, selectedDate, view } = useEventCalendar();

  const searchedEvents = useMemo(
    () => events.filter((event) => eventMatchesSearch(event, searchTerm)),
    [events, searchTerm],
  );
  const expandedEvents = useMemo(
    () => expandRecurringEventsForView(searchedEvents, selectedDate, view),
    [searchedEvents, selectedDate, view],
  );
  const visibleEvents = useMemo(() => filterEventsForView(expandedEvents, selectedDate, view), [expandedEvents, selectedDate, view]);
  const { singleDayEvents, multiDayEvents } = useMemo(() => splitEventsByDuration(visibleEvents), [visibleEvents]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <CalendarHeader events={expandedEvents} showViewSwitcher={showHeaderViewSwitcher} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <CalendarDndProvider>
          {view === 'day' && <CalendarDayView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
          {view === 'week' && <CalendarWeekView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
          {view === 'month' && <CalendarMonthView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
          {view === 'agenda' && <CalendarAgendaView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
        </CalendarDndProvider>
      </div>
    </div>
  );
}

export function EventCalendar({
  events,
  initialView = 'month',
  view,
  viewStorageKey,
  searchTerm = '',
  onRequestCreateEvent,
  onEventClick,
  selectedDate,
  onDateChange,
  onViewChange,
  onEventMove,
  showHeaderViewSwitcher = true,
}: EventCalendarProps) {
  return (
    <EventCalendarProvider
      events={events}
      initialView={initialView}
      view={view}
      viewStorageKey={viewStorageKey}
      selectedDate={selectedDate}
      onDateChange={onDateChange}
      onRequestCreateEvent={onRequestCreateEvent}
      onEventClick={onEventClick}
      onViewChange={onViewChange}
      onEventMove={onEventMove}
    >
      <EventCalendarContent
        searchTerm={searchTerm}
        showHeaderViewSwitcher={showHeaderViewSwitcher}
      />
    </EventCalendarProvider>
  );
}
