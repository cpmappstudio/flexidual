"use client";

import { useState, useMemo, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Calendar from "@/components/calendar/calendar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, isSameDay, startOfDay } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import CalendarProvider from "@/components/calendar/calendar-provider";

import CalendarManageEventDialog from "@/components/calendar/dialog/calendar-manage-event-dialog";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { useTranslations, useLocale } from "next-intl";

import { CalendarEvent, Mode } from "@/components/calendar/calendar-types";
import { ScheduleItem } from "@/components/schedule/schedule-item";

import { useAdminSchoolFilter } from "@/components/providers/admin-school-filter-provider";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

// Internal component to handle Agenda Logic using Context
function AgendaView({ filteredEvents }: { filteredEvents: CalendarEvent[] }) {
  const { setSelectedEvent, setManageEventDialogOpen } = useCalendarContext();

  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: { date: Date; events: CalendarEvent[] } } =
      {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingEvents = filteredEvents
      .filter((e) => e.start.getTime() >= today.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    upcomingEvents.forEach((event) => {
      const eventDateStart = startOfDay(event.start);
      const dateKey = format(eventDateStart, "yyyy-MM-dd");
      if (!groups[dateKey]) {
        groups[dateKey] = { date: eventDateStart, events: [] };
      }
      groups[dateKey].events.push(event);
    });

    // Sort events within each day
    Object.keys(groups).forEach((key) => {
      groups[key].events.sort((a, b) => a.start.getTime() - b.start.getTime());
    });

    return groups;
  }, [filteredEvents]);

  const sortedDates = Object.keys(groupedEvents).sort();

  if (sortedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t("calendar.noUpcoming")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => {
        const { date, events: dayEvents } = groupedEvents[dateKey];
        const isToday = isSameDay(date, new Date());

        return (
          <div key={dateKey} className="space-y-3">
            <div className="flex items-center gap-2 bg-background py-2 border-b z-10">
              <h3
                className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}
              >
                {format(date, "EEEE, MMMM d, yyyy", { locale: dateLocale })}
              </h3>
              {isToday && (
                <Badge variant="secondary" className="text-xs">
                  {t("dashboard.today")}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {dayEvents.map((event) => (
                <ScheduleItem
                  key={event.scheduleId}
                  schedule={{
                    scheduleId: event.scheduleId,
                    lessonIds: event.lessonIds,
                    lessons: event.lessons,
                    classId: event.classId,
                    title: event.title || event.className,
                    description: event.description,
                    start: event.start,
                    end: event.end,
                    roomName: event.roomName || "",
                    sessionType: event.sessionType,
                    isLive: event.isLive,
                    status: event.status,
                    className: event.className,
                    curriculumTitle: event.curriculumTitle,
                  }}
                  showDate={false}
                  showEdit={false}
                  showDescription={false}
                  onEventClick={() => {
                    setSelectedEvent(event);
                    setManageEventDialogOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarContent() {
  const [mode, setMode] = useState<Mode>("month");
  const [date, setDate] = useState<Date>(new Date());

  const [selectedTeacherId, setSelectedTeacherId] = useState<Id<"users"> | null>(null);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<Id<"curriculums"> | null>(null);

  const { user } = useCurrentUser();


  const searchParams = useSearchParams();
  const classIdParam = searchParams.get("classId") as Id<"classes"> | null;

  // Global school/campus filter
  const { selectedSchoolId, selectedCampusId, isAvailable } = useAdminSchoolFilter();

  const scheduleData = useQuery(api.schedule.getMySchedule, {
    teacherId: selectedTeacherId ?? undefined,
    ...(isAvailable && selectedCampusId !== "all"
      ? { campusId: selectedCampusId as Id<"campuses"> }
      : isAvailable && selectedSchoolId !== "all"
      ? { schoolId: selectedSchoolId as Id<"schools"> }
      : {}),
  });

  const allEvents = useMemo(() => {
    if (!scheduleData) return [];

    return scheduleData.map((e) => ({
      id: e.scheduleId,
      _id: e.scheduleId,
      scheduleId: e.scheduleId,
      lessonIds: e.lessonIds,
      classId: e.classId,
      curriculumId: e.curriculumId,
      sessionType: e.sessionType,
      title: e.title,
      description: e.description,
      start: new Date(e.start),
      end: new Date(e.end),
      color: e.color,
      className: e.className,
      curriculumTitle: e.curriculumTitle,
      roomName: e.roomName,
      isLive: e.isLive,
      status: e.status,
      isRecurring: e.isRecurring,
      recurrenceRule: e.recurrenceRule,
      teacherName: e.teacherName,
      teacherImageUrl: e.teacherImageUrl,
      hasRecording: e.hasRecording,
    }));
  }, [scheduleData]);

  const filteredEvents = useMemo(() => {
    let result = allEvents;

    if (classIdParam) {
      result = result.filter((e) => e.classId === classIdParam);
    }

    if (selectedCurriculumId && !classIdParam) {
      result = result.filter((e) => e.curriculumId === selectedCurriculumId);
    }

    return result;
  }, [allEvents, classIdParam, selectedCurriculumId]);

  const [, setEvents] = useState<CalendarEvent[]>([]);

  useMemo(() => {
    setEvents(filteredEvents);
  }, [filteredEvents]);

  if (scheduleData === undefined) {
    return <Skeleton className="h-full min-h-0 w-full" />;
  }

  return (
    <CalendarProvider
        events={filteredEvents}
        setEvents={setEvents}
        mode={mode}
        setMode={setMode}
        date={date}
        setDate={setDate}
        userId={user?._id}
        selectedTeacherId={selectedTeacherId}
        onTeacherChange={setSelectedTeacherId}
        selectedCurriculumId={selectedCurriculumId}
        onCurriculumChange={setSelectedCurriculumId}
      >
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
          <Tabs defaultValue="month" className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <TabsContent
              value="month"
              className="m-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
            >
              <Calendar
                events={filteredEvents}
                setEvents={setEvents}
                mode={mode}
                setMode={setMode}
                date={date}
                setDate={setDate}
              />
            </TabsContent>

            <TabsContent
              value="agenda"
              className="flex-1 min-h-0 overflow-y-auto m-0 p-4 data-[state=active]:block"
            >
              <AgendaView filteredEvents={filteredEvents} />
            </TabsContent>
          </Tabs>

          <CalendarManageEventDialog />
        </div>
    </CalendarProvider>
  );
}

export default function CalendarPage() {
  return (
    <div className="flex h-[calc(100svh-var(--header-height)-2rem)] min-h-0 w-full overflow-hidden md:h-[calc(100svh-var(--header-height)-3rem)]">
      <div className="h-full min-h-0 flex-1 overflow-hidden">
        <Suspense
          fallback={<Skeleton className="h-full min-h-0 w-full" />}
        >
          <CalendarContent />
        </Suspense>
      </div>
    </div>
  );
}
