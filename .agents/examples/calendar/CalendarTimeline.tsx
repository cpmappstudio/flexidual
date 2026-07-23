'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';

interface CalendarTimelineProps {
  firstVisibleHour: number;
  lastVisibleHour: number;
}

export function CalendarTimeline({ firstVisibleHour, lastVisibleHour }: CalendarTimelineProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentHour = currentTime.getHours();
  if (currentHour < firstVisibleHour || currentHour >= lastVisibleHour) return null;

  const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const visibleStartMinutes = firstVisibleHour * 60;
  const visibleEndMinutes = lastVisibleHour * 60;
  const visibleRangeMinutes = visibleEndMinutes - visibleStartMinutes;
  const top = ((minutes - visibleStartMinutes) / visibleRangeMinutes) * 100;

  return (
    <div className="pointer-events-none absolute inset-x-0 z-50 border-t border-[#2F6D7C] dark:border-[#B9E4E8]" style={{ top: `${top}%` }}>
      <div className="absolute left-0 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2F6D7C] dark:bg-[#B9E4E8]" />
      <div className="absolute -left-[4.5rem] flex w-16 -translate-y-1/2 justify-end bg-white pr-1 text-xs font-medium text-[#2F6D7C] dark:bg-zinc-950 dark:text-[#B9E4E8]">
        {format(currentTime, 'h:mm a')}
      </div>
    </div>
  );
}
