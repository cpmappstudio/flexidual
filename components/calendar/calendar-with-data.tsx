"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Calendar from "./calendar";
import { CalendarEvent, Mode } from "./calendar-types";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Loader2 } from "lucide-react";

export default function CalendarWithData() {
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mode, setMode] = useState<Mode>("month");
  const [date, setDate] = useState<Date>(new Date());

  // Calculate date range for the current view
  const dateRange = getDateRangeForMode(date, mode);

  // Fetch schedule from our new getMySchedule query
  const scheduleData = useQuery(
    api.schedule.getMySchedule,
    user?._id
      ? {
          from: dateRange.from.getTime(),
          to: dateRange.to.getTime(),
        }
      : "skip"
  );

  useEffect(() => {
    if (scheduleData) {
      const transformedEvents: CalendarEvent[] = scheduleData.map((item) => ({
        id: item.scheduleId,
        _id: item.scheduleId,
        scheduleId: item.scheduleId,
        lessonId: item.lessonId,
        classId: item.classId,
        curriculumId: item.curriculumId,
        
        // Display
        title: item.title,
        description: item.description,
        start: new Date(item.start),
        end: new Date(item.end),
        color: item.color,
        
        // Context
        className: item.className,
        curriculumTitle: item.curriculumTitle,
        
        // LiveKit
        roomName: item.roomName,
        isLive: item.isLive,
        
        // Status
        status: item.status,
      }));

      setEvents(transformedEvents);
    }
  }, [scheduleData]);

  const handleSetEvents = useCallback((newEvents: CalendarEvent[]) => {
    setEvents(newEvents);
  }, []);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please sign in to view your schedule.</p>
      </div>
    );
  }

  return (
    <Calendar
      events={events}
      setEvents={handleSetEvents}
      mode={mode}
      setMode={setMode}
      date={date}
      setDate={setDate}
      isLoading={scheduleData === undefined}
      userId={user._id}
    />
  );
}

// Helper to calculate date range based on mode
function getDateRangeForMode(date: Date, mode: Mode): { from: Date; to: Date } {
  const from = new Date(date);
  const to = new Date(date);

  switch (mode) {
    case "day":
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;

    case "week":
      // Start of week (Sunday)
      from.setDate(date.getDate() - date.getDay());
      from.setHours(0, 0, 0, 0);
      // End of week (Saturday)
      to.setDate(from.getDate() + 6);
      to.setHours(23, 59, 59, 999);
      break;

    case "month":
      // Start of month
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      // End of month
      to.setMonth(from.getMonth() + 1);
      to.setDate(0);
      to.setHours(23, 59, 59, 999);
      break;
  }

  return { from, to };
}