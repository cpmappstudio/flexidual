'use client';

import { differenceInMilliseconds, parseISO } from 'date-fns';
import { useDrop } from 'react-dnd';

import { cn } from '@/lib/utils';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';
import { CalendarDragItemTypes } from '@/presentation/components/calendar/dnd/DraggableEvent';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

interface DroppableTimeBlockProps {
  date: Date;
  hour: number;
  minute: number;
  children: React.ReactNode;
}

export function DroppableTimeBlock({ date, hour, minute, children }: DroppableTimeBlockProps) {
  const { onEventMove } = useEventCalendar();

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: CalendarDragItemTypes.EVENT,
      drop: (item: { event: CalendarEvent }) => {
        if (!onEventMove) return;

        const eventStartDate = parseISO(item.event.startDate);
        const eventEndDate = parseISO(item.event.endDate);
        const durationMs = differenceInMilliseconds(eventEndDate, eventStartDate);
        const newStartDate = new Date(date);
        newStartDate.setHours(hour, minute, 0, 0);
        const newEndDate = new Date(newStartDate.getTime() + durationMs);

        onEventMove(item.event, newStartDate.toISOString(), newEndDate.toISOString());
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [date, hour, minute, onEventMove],
  );

  return (
    <div
      ref={(node) => {
        drop(node);
      }}
      className={cn('h-6', isOver && canDrop && 'bg-[#2F6D7C]/10 dark:bg-[#B9E4E8]/10')}
    >
      {children}
    </div>
  );
}
