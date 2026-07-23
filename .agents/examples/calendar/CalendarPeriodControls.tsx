'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { navigateCalendarDate } from '@/lib/calendar';
import { cn } from '@/lib/utils';
import { Button } from '@/presentation/components/ui/button';

import type { CalendarView } from '@/presentation/components/calendar/types';

interface CalendarPeriodControlsProps {
  selectedDate: Date;
  view: CalendarView;
  onSelectedDateChange: (date: Date) => void;
  className?: string;
}

export function CalendarPeriodControls({
  selectedDate,
  view,
  onSelectedDateChange,
  className,
}: CalendarPeriodControlsProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 cursor-pointer px-3"
        onClick={() => onSelectedDateChange(new Date())}
      >
        Hoy
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer"
        onClick={() => onSelectedDateChange(navigateCalendarDate(selectedDate, view, 'previous'))}
        aria-label="Periodo anterior"
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer"
        onClick={() => onSelectedDateChange(navigateCalendarDate(selectedDate, view, 'next'))}
        aria-label="Periodo siguiente"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
