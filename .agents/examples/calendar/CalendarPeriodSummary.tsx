'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';

import { getEventsCount } from '@/lib/calendar';
import { Badge } from '@/presentation/components/ui/badge';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface CalendarPeriodSummaryProps {
  events: CalendarEvent[];
}

export function CalendarPeriodSummary({ events }: CalendarPeriodSummaryProps) {
  const { selectedDate, view } = useEventCalendar();
  const month = format(selectedDate, 'MMMM');
  const year = selectedDate.getFullYear();
  const eventCount = useMemo(() => getEventsCount(events, selectedDate, view), [events, selectedDate, view]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
        {month} {year}
      </span>
      <Badge variant="outline" className="border-[#2F6D7C]/30 px-1.5 text-[#2F6D7C]">
        {eventCount} actas
      </Badge>
    </div>
  );
}
