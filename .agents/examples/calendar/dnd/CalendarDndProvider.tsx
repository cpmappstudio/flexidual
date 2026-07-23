'use client';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface CalendarDndProviderProps {
  children: React.ReactNode;
}

export function CalendarDndProvider({ children }: CalendarDndProviderProps) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}

