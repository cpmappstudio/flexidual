'use client';

import { format } from 'date-fns';

import { cn } from '@/lib/utils';
import { isWorkingHour } from '@/lib/calendar';
import { useEventCalendar } from '@/presentation/hooks/useEventCalendar';
import { DroppableTimeBlock } from '@/presentation/components/calendar/dnd/DroppableTimeBlock';

interface CalendarTimeGridProps {
  day: Date;
  hours: number[];
  children?: React.ReactNode;
  showHourLabels?: boolean;
}

export function CalendarTimeGrid({ day, hours, children, showHourLabels = true }: CalendarTimeGridProps) {
  const { workingHours, openCreateDialog } = useEventCalendar();

  return (
    <div className="relative">
      {hours.map((hour, index) => {
        const disabled = !isWorkingHour(day, hour, workingHours);

        return (
          <div
            key={hour}
            className={cn('relative h-24 border-b border-zinc-200 dark:border-zinc-800', disabled && 'calendar-disabled-hour')}
          >
            {showHourLabels && index !== 0 && (
              <div className="pointer-events-none absolute -left-[4.5rem] -top-3 flex h-6 w-[4rem] items-center justify-end pr-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{format(new Date().setHours(hour, 0, 0, 0), 'h a')}</span>
              </div>
            )}

            {[0, 15, 30, 45].map((minute) => {
              const slotDate = new Date(day);
              slotDate.setHours(hour, minute, 0, 0);

              return (
                <DroppableTimeBlock key={minute} date={day} hour={hour} minute={minute}>
                  <button
                    type="button"
                    onClick={() => openCreateDialog(slotDate)}
                    className="absolute inset-x-0 h-6 transition-colors hover:bg-[#2F6D7C]/5 dark:hover:bg-[#B9E4E8]/5"
                    style={{ top: `${minute * 1.6}px` }}
                    aria-label={`Crear reunion ${format(slotDate, 'h:mm a')}`}
                  />
                </DroppableTimeBlock>
              );
            })}

            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-b border-dashed border-zinc-200 dark:border-zinc-800" />
          </div>
        );
      })}
      {children}
    </div>
  );
}
