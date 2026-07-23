'use client';

import { SegmentedIconToggle } from '@/presentation/components/SegmentedIconToggle';
import { CalendarPeriodControls } from '@/presentation/components/calendar/CalendarPeriodControls';
import { CalendarPeriodSummary } from '@/presentation/components/calendar/CalendarPeriodSummary';
import { CALENDAR_VIEW_OPTIONS } from '@/presentation/components/calendar/calendarViewOptions';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface CalendarHeaderProps {
  events: CalendarEvent[];
  showViewSwitcher?: boolean;
}

export function CalendarHeader({ events, showViewSwitcher = true }: CalendarHeaderProps) {
  const { selectedDate, setSelectedDate, view, setView } = useEventCalendar();

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-200 bg-white px-0 py-1.5 dark:border-zinc-800 dark:bg-zinc-900 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarPeriodControls
          selectedDate={selectedDate}
          view={view}
          onSelectedDateChange={setSelectedDate}
        />
        <CalendarPeriodSummary events={events} />
      </div>

      {showViewSwitcher && (
        <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between">
          <SegmentedIconToggle
            value={view}
            options={CALENDAR_VIEW_OPTIONS}
            onChange={setView}
          />
        </div>
      )}
    </div>
  );
}
