'use client';

import { differenceInMinutes, format, parseISO } from 'date-fns';

import { cn } from '@/lib/utils';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';
import { DraggableEvent } from '@/presentation/components/calendar/dnd/DraggableEvent';
import { CALENDAR_EVENT_COLOR_CLASSES } from '@/presentation/components/calendar/eventColorClasses';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface EventBlockProps {
  event: CalendarEvent;
  compact?: boolean;
  className?: string;
}

export function EventBlock({ event, compact = false, className }: EventBlockProps) {
  const { badgeVariant, openEventDetails } = useEventCalendar();
  const start = parseISO(event.startDate);
  const end = parseISO(event.endDate);
  const durationInMinutes = Math.max(differenceInMinutes(end, start), 15);
  const heightInPixels = compact ? undefined : Math.max((durationInMinutes / 60) * 96 - 8, 24);
  const showTime = !compact && durationInMinutes > 25;

  return (
    <DraggableEvent event={event}>
      <button
        type="button"
        onClick={(eventClick) => {
          eventClick.stopPropagation();
          openEventDetails(event);
        }}
        className={cn(
          'flex w-full select-none flex-col gap-0.5 truncate whitespace-nowrap rounded-md border px-2 py-1.5 text-left text-xs shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6D7C]',
          CALENDAR_EVENT_COLOR_CLASSES[event.color],
          durationInMinutes < 35 && !compact && 'justify-center py-0',
          className,
        )}
        style={heightInPixels ? { height: `${heightInPixels}px` } : undefined}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {['mixed', 'dot'].includes(badgeVariant) && (
            <svg width="8" height="8" viewBox="0 0 8 8" className="event-dot shrink-0">
              <circle cx="4" cy="4" r="4" />
            </svg>
          )}
          <span className="truncate font-semibold">{event.title}</span>
        </span>
        {showTime && (
          <span className="truncate">
            {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
          </span>
        )}
      </button>
    </DraggableEvent>
  );
}
