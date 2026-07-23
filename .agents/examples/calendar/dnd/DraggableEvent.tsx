'use client';

import { useDrag } from 'react-dnd';

import type { CalendarEvent } from '@/presentation/components/calendar/types';

export const CalendarDragItemTypes = {
  EVENT: 'calendar-event',
} as const;

interface DraggableEventProps {
  event: CalendarEvent;
  children: React.ReactNode;
}

export function DraggableEvent({ event, children }: DraggableEventProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: CalendarDragItemTypes.EVENT,
    item: { event },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={(node) => {
        drag(node);
      }}
      className={isDragging ? 'opacity-40' : undefined}
    >
      {children}
    </div>
  );
}
