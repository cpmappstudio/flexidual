"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Calendar from "@/components/calendar/calendar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { useParams, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import CalendarProvider from "@/components/calendar/calendar-provider";

import CalendarManageEventDialog from "@/components/calendar/dialog/calendar-manage-event-dialog";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { useTranslations, useLocale } from "next-intl";

import { CalendarEvent, Mode } from "@/components/calendar/calendar-types";
import { TZDate } from "@date-fns/tz";
import { ScheduleItem } from "@/components/schedule/schedule-item";

import { useSettingsContext } from "@/hooks/use-settings-context";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useCurrentMinute } from "@/hooks/use-current-minute";

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
                    timeZone: event.timeZone,
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

  const [selectedTeacherId, setSelectedTeacherId] =
    useState<Id<"users"> | null>(null);
  const [selectedCourseId, setSelectedCourseId] =
    useState<Id<"classes"> | null>(null);
  const [selectedGradeCode, setSelectedGradeCode] = useState<string | null>(
    null,
  );

  const { user } = useCurrentUser();

  const searchParams = useSearchParams();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const classIdParam = searchParams.get("classId") as Id<"classes"> | null;

  const { context: settingsContext } = useSettingsContext();
  const { access } = useStaffAccess();
  const canViewAllCampusCourses = access?.canManageCampus ?? false;
  const now = useCurrentMinute();
  const calendarSchoolId = settingsContext?.institution._id;
  const calendarCampusId =
    orgContext?.type === "campus"
      ? (orgContext._id as Id<"campuses">)
      : undefined;
  const scopeKey = orgContext
    ? `${orgContext.type}:${orgContext._id}`
    : undefined;
  const filterOptions = useQuery(
    api.classes.listFilterOptions,
    orgContext
      ? {
          schoolId:
            orgContext.type === "school"
              ? (orgContext._id as Id<"schools">)
              : undefined,
          campusId: calendarCampusId,
        }
      : "skip",
  );
  const grades = useQuery(
    api.grades.list,
    calendarSchoolId ? { schoolId: calendarSchoolId } : "skip",
  );
  const gradeOptions = useMemo(() => {
    if (!grades) return [];
    if (canViewAllCampusCourses) {
      return grades.map((grade) => ({
        value: grade.code,
        label: grade.name,
      }));
    }

    const assignedGradeCodes = new Set(
      filterOptions?.courses.flatMap((course) =>
        course.gradeCode ? [course.gradeCode] : [],
      ) ?? [],
    );
    return grades
      .filter((grade) => assignedGradeCodes.has(grade.code))
      .map((grade) => ({
        value: grade.code,
        label: grade.name,
      }));
  }, [canViewAllCampusCourses, filterOptions?.courses, grades]);
  const scheduleWindow = useQuery(
    api.academicSettings.getScheduleWindow,
    calendarSchoolId
      ? { schoolId: calendarSchoolId, campusId: calendarCampusId }
      : "skip",
  );
  const visibleRange = useMemo(() => {
    const weekOptions = { weekStartsOn: 0 as const };
    const start =
      mode === "day"
        ? startOfDay(date)
        : mode === "week"
          ? startOfWeek(date, weekOptions)
          : startOfWeek(startOfMonth(date), weekOptions);
    const end =
      mode === "day"
        ? endOfDay(date)
        : mode === "week"
          ? endOfWeek(date, weekOptions)
          : endOfWeek(endOfMonth(date), weekOptions);
    const timeZoneBuffer = 24 * 60 * 60 * 1000;
    return {
      from: start.getTime() - timeZoneBuffer,
      to: end.getTime() + timeZoneBuffer,
    };
  }, [date, mode]);

  const scheduleResult = useQuery(
    api.schedule.getMySchedule,
    orgContext
      ? {
          ...visibleRange,
          now,
          includeAttendance: false,
          ...(orgContext.type === "campus"
            ? { campusId: orgContext._id }
            : orgContext.type === "school"
              ? { schoolId: orgContext._id }
              : {}),
        }
      : "skip",
  );
  const [retainedSchedule, setRetainedSchedule] = useState<{
    scopeKey: string;
    data: Exclude<typeof scheduleResult, undefined>;
  } | null>(null);

  useEffect(() => {
    if (scheduleResult !== undefined && scopeKey) {
      setRetainedSchedule({ scopeKey, data: scheduleResult });
    }
  }, [scheduleResult, scopeKey]);

  useEffect(() => {
    setSelectedCourseId(classIdParam);
    setSelectedTeacherId(null);
    setSelectedGradeCode(null);
  }, [classIdParam, scopeKey]);

  const scheduleData =
    scheduleResult ??
    (retainedSchedule && retainedSchedule.scopeKey === scopeKey
      ? retainedSchedule.data
      : undefined);

  const allEvents = useMemo(() => {
    if (!scheduleData) return [];

    return scheduleData.map((e) => ({
      id: e.scheduleId,
      _id: e.scheduleId,
      scheduleId: e.scheduleId,
      lessonIds: e.lessonIds,
      classId: e.classId,
      curriculumId: e.curriculumId,
      teacherId: e.teacherId,
      gradeCode: e.gradeCode,
      sessionType: e.sessionType,
      title: e.title,
      description: e.description,
      start: new TZDate(e.start, e.timeZone),
      end: new TZDate(e.end, e.timeZone),
      timeZone: e.timeZone,
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

    if (selectedCourseId) {
      result = result.filter((event) => event.classId === selectedCourseId);
    }

    if (selectedTeacherId) {
      result = result.filter((event) => event.teacherId === selectedTeacherId);
    }

    if (selectedGradeCode) {
      result = result.filter((event) => event.gradeCode === selectedGradeCode);
    }

    return result;
  }, [allEvents, selectedCourseId, selectedGradeCode, selectedTeacherId]);

  if (scheduleData === undefined) {
    return <Skeleton className="h-full min-h-0 w-full" />;
  }

  return (
    <CalendarProvider
      events={filteredEvents}
      mode={mode}
      setMode={setMode}
      date={date}
      setDate={setDate}
      scheduleStartMinutes={scheduleWindow?.startMinutes}
      scheduleEndMinutes={scheduleWindow?.endMinutes}
      userId={user?._id}
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <Tabs
          defaultValue="month"
          className="flex h-full min-h-0 w-full flex-col overflow-hidden"
        >
          <TabsContent
            value="month"
            className="m-0 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
          >
            <Calendar
              filters={{
                courses:
                  filterOptions?.courses.map((course) => ({
                    value: course._id,
                    label: course.name,
                  })) ?? [],
                teachers:
                  filterOptions?.teachers.map((teacher) => ({
                    value: teacher._id,
                    label: teacher.fullName,
                  })) ?? [],
                grades: gradeOptions,
                showTeacherFilter: canViewAllCampusCourses,
                selectedCourseId,
                selectedTeacherId,
                selectedGradeCode,
                onCourseChange: setSelectedCourseId,
                onTeacherChange: setSelectedTeacherId,
                onGradeChange: setSelectedGradeCode,
              }}
            />
          </TabsContent>

          <TabsContent
            value="agenda"
            className="flex-1 min-h-0 overflow-y-auto m-0 p-4 data-[state=active]:block"
          >
            <AgendaView filteredEvents={filteredEvents} />
          </TabsContent>
        </Tabs>

        <CalendarManageEventDialog readOnly={!access?.canManageCampus} />
      </div>
    </CalendarProvider>
  );
}

export default function CalendarPage() {
  return (
    <div className="flex h-[calc(100svh-var(--header-height)-2rem)] min-h-0 w-full overflow-hidden md:h-[calc(100svh-var(--header-height)-3rem)]">
      <div className="h-full min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<Skeleton className="h-full min-h-0 w-full" />}>
          <CalendarContent />
        </Suspense>
      </div>
    </div>
  );
}
