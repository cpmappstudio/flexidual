"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Calendar from "@/components/calendar/calendar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CircleAlert } from "lucide-react";
import { format, isSameDay, startOfDay } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { useParams, useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import CalendarProvider from "@/components/calendar/calendar-provider";

import CalendarManageEventDialog from "@/components/calendar/dialog/calendar-manage-event-dialog";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@clerk/nextjs";

import { CalendarEvent, Mode } from "@/components/calendar/calendar-types";
import { TZDate, tz } from "@date-fns/tz";
import { ScheduleItem } from "@/components/schedule/schedule-item";

import { useSettingsContext } from "@/hooks/use-settings-context";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { getRoleForOrg } from "@/lib/rbac";
import {
  getCalendarUtcRange,
  resolveCalendarTimeZones,
} from "@/lib/calendar-time-zone";
import { dateInTimeZone } from "@/lib/time-zone";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

// Internal component to handle Agenda Logic using Context
function AgendaView({ filteredEvents }: { filteredEvents: CalendarEvent[] }) {
  const { displayTimeZone, setSelectedEvent, setManageEventDialogOpen } =
    useCalendarContext();

  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: { date: Date; events: CalendarEvent[] } } =
      {};

    const today = startOfDay(TZDate.tz(displayTimeZone), {
      in: tz(displayTimeZone),
    });

    const upcomingEvents = filteredEvents
      .filter((e) => e.start.getTime() >= today.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    upcomingEvents.forEach((event) => {
      const eventDateStart = startOfDay(event.start, {
        in: tz(displayTimeZone),
      });
      const dateKey = format(eventDateStart, "yyyy-MM-dd", {
        in: tz(displayTimeZone),
      });
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
  }, [displayTimeZone, filteredEvents]);

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
        const isToday = isSameDay(date, Date.now(), {
          in: tz(displayTimeZone),
        });

        return (
          <div key={dateKey} className="space-y-3">
            <div className="flex items-center gap-2 bg-background py-2 border-b z-10">
              <h3
                className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}
              >
                {format(date, "EEEE, MMMM d, yyyy", {
                  locale: dateLocale,
                  in: tz(displayTimeZone),
                })}
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
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [date, setDate] = useState<Date>(new Date());

  const [selectedTeacherId, setSelectedTeacherId] =
    useState<Id<"users"> | null>(null);
  const [selectedCourseId, setSelectedCourseId] =
    useState<Id<"classes"> | null>(null);
  const [selectedGradeCode, setSelectedGradeCode] = useState<string | null>(
    null,
  );

  const { user } = useCurrentUser();
  const { isLoaded: isClerkLoaded, isSignedIn, sessionClaims } = useAuth();
  const {
    isAuthenticated: isConvexAuthenticated,
    isLoading: isConvexAuthLoading,
  } = useConvexAuth();

  const searchParams = useSearchParams();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isStudent = role === "student";
  const mode = selectedMode ?? (isStudent ? "day" : "month");
  const isCalendarAuthReady =
    isClerkLoaded &&
    isSignedIn === true &&
    !isConvexAuthLoading &&
    isConvexAuthenticated;
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isCalendarAuthReady ? { slug: orgSlug } : "skip",
  );
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
  const gradeNameByCode = useMemo(
    () => new Map((grades ?? []).map((grade) => [grade.code, grade.name])),
    [grades],
  );
  const scheduleWindow = useQuery(
    api.academicSettings.getScheduleWindow,
    calendarSchoolId
      ? { schoolId: calendarSchoolId, campusId: calendarCampusId }
      : "skip",
  );
  const browserTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const calendarTimeZones = useMemo(
    () =>
      scheduleWindow
        ? resolveCalendarTimeZones({
            scopeType: scheduleWindow.scopeType,
            institutionTimeZone: scheduleWindow.institutionTimeZone,
            campusTimeZone: scheduleWindow.campusTimeZone,
            isStudent,
            browserTimeZone,
          })
        : null,
    [browserTimeZone, isStudent, scheduleWindow],
  );
  const displayTimeZone = calendarTimeZones?.displayTimeZone;
  const schedulingTimeZone = calendarTimeZones?.schedulingTimeZone;

  const visibleRange = useMemo(() => {
    if (!displayTimeZone || !isCalendarAuthReady) return null;
    const selectedDate = dateInTimeZone(date.getTime(), displayTimeZone);
    return getCalendarUtcRange(selectedDate, mode, displayTimeZone);
  }, [date, displayTimeZone, isCalendarAuthReady, mode]);

  const scheduleResult = useQuery(
    api.schedule.getMySchedule,
    orgContext && visibleRange
      ? {
          from: visibleRange.from,
          to: visibleRange.to - 1,
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

  useEffect(() => {
    setSelectedCourseId(classIdParam);
    setSelectedTeacherId(null);
    setSelectedGradeCode(null);
  }, [classIdParam, scopeKey]);

  const scheduleData = scheduleResult;
  const tCalendar = useTranslations("calendar");

  const allEvents = useMemo(() => {
    if (!scheduleData) return [];

    return scheduleData.map((e) => ({
      id: e.scheduleId,
      _id: e.scheduleId,
      scheduleId: e.scheduleId,
      classId: e.classId,
      curriculumId: e.curriculumId,
      teacherId: e.teacherId,
      gradeCode: e.gradeCode,
      gradeLabel: e.gradeCode
        ? (gradeNameByCode.get(e.gradeCode) ?? e.gradeCode)
        : undefined,
      sessionType: e.sessionType,
      title: e.title,
      description: e.description,
      start: new TZDate(e.start, displayTimeZone),
      end: new TZDate(e.end, displayTimeZone),
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
  }, [displayTimeZone, gradeNameByCode, scheduleData]);

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

  if (scheduleWindow === null || (scheduleWindow && !schedulingTimeZone)) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center px-4 text-center">
        <div className="max-w-md">
          <CircleAlert className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">
            {tCalendar("timeZoneUnavailable")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tCalendar("timeZoneUnavailableDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (
    scheduleWindow === undefined ||
    !isCalendarAuthReady ||
    !displayTimeZone ||
    !schedulingTimeZone ||
    !visibleRange ||
    scheduleData === undefined
  ) {
    return <Skeleton className="h-full min-h-0 w-full" />;
  }

  return (
    <CalendarProvider
      events={filteredEvents}
      mode={mode}
      setMode={setSelectedMode}
      date={date}
      setDate={setDate}
      scheduleStartMinutes={scheduleWindow?.startMinutes}
      scheduleEndMinutes={scheduleWindow?.endMinutes}
      schedulingTimeZone={schedulingTimeZone}
      displayTimeZone={displayTimeZone}
      isUsingLocalTime={calendarTimeZones.isUsingLocalTime}
      isStudent={isStudent}
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
              isStudent={isStudent}
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
                showGradeFilter: !isStudent,
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
