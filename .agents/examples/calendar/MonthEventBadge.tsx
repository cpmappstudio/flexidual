'use client';

import { format, isSameDay, parseISO } from 'date-fns';

import { cn } from '@/lib/utils';
import { EventBlock } from '@/presentation/components/calendar/EventBlock';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface MonthEventBadgeProps {
  event: CalendarEvent;
  cellDate: Date;
}

export function MonthEventBadge({ event, cellDate }: MonthEventBadgeProps) {
  const start = parseISO(event.startDate);
  const shouldShowTime = isSameDay(start, cellDate);

  return (
    <div className="min-w-0">
      <EventBlock
        event={event}
        compact
        className={cn('h-6 px-1.5 py-0 text-[11px]', !shouldShowTime && 'rounded-l-none')}
      />
      {shouldShowTime && <span className="sr-only">{format(start, 'h:mm a')}</span>}
    </div>
  );
}

