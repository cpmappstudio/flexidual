"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
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
import { useRouter } from "@/i18n/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import CalendarProvider from "@/components/calendar/calendar-provider";

import { useCalendarContext } from "@/components/calendar/calendar-context";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import CalendarEventActions from "@/components/calendar/header/actions/calendar-event-actions";
import { CalendarOccurrenceDialog } from "@/components/calendar/dialog/calendar-occurrence-dialog";

import {
  CalendarEvent,
  InstitutionalCalendarEvent,
  Mode,
} from "@/components/calendar/calendar-types";
import { splitCalendarEventAcrossDays } from "@/components/calendar/calendar-event-layout";
import { TZDate, tz } from "@date-fns/tz";
import { ScheduleItem } from "@/components/schedule/schedule-item";
import { CalendarAgendaEvent } from "@/components/calendar/calendar-agenda-event";

import { useSettingsContext } from "@/hooks/use-settings-context";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { getRoleForOrg } from "@/lib/rbac";
import {
  getCalendarUtcRange,
  resolveCalendarTimeZones,
} from "@/lib/calendar-time-zone";
import { dateInTimeZone } from "@/lib/time-zone";

const CalendarManageEventDialog = dynamic(
  () => import("@/components/calendar/dialog/calendar-manage-event-dialog"),
);
const CalendarEventExplorerDialog = dynamic(
  () =>
    import("@/components/events/event-explorer-dialog").then(
      (module) => module.EventExplorerDialog,
    ),
  { ssr: false },
);
const CalendarClosureDialog = dynamic(
  () => import("@/components/calendar/dialog/calendar-closure-dialog"),
);

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

// Internal component to handle Agenda Logic using Context
function AgendaView({
  filteredEvents,
  isStudent,
  now,
}: {
  filteredEvents: CalendarEvent[];
  isStudent: boolean;
  now: number;
}) {
  const { displayTimeZone, setSelectedEvent, setManageEventDialogOpen } =
    useCalendarContext();

  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: { date: Date; events: CalendarEvent[] } } =
      {};

    const today = startOfDay(new TZDate(now, displayTimeZone), {
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
  }, [displayTimeZone, filteredEvents, now]);

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
        const isToday = isSameDay(date, now, {
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
              {dayEvents.map((event) =>
                event.kind === "event" ? (
                  <CalendarAgendaEvent key={event.id} event={event} />
                ) : (
                  <ScheduleItem
                    key={event.id}
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
                      canLeadSession: event.canLeadSession,
                      sessionStartedAt: event.sessionStartedAt,
                      sessionReopenUntil: event.sessionReopenUntil,
                      sessionEndedAt: event.sessionEndedAt,
                      sessionEndedByName: event.sessionEndedByName,
                      sessionClosing: event.sessionClosing,
                      sessionCloseRetrying: event.sessionCloseRetrying,
                      sessionEndedAutomatically:
                        event.sessionEndedAutomatically,
                    }}
                    showDate={false}
                    showEdit={false}
                    showDescription={false}
                    isStudent={Boolean(isStudent)}
                    now={now}
                    onEventClick={() => {
                      setSelectedEvent(event);
                      setManageEventDialogOpen(true);
                    }}
                  />
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarContent() {
  const searchParams = useSearchParams();
  const classIdParam = searchParams.get("classId") as Id<"classes"> | null;
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const now = useCurrentMinute();

  const [selectedTeacherId, setSelectedTeacherId] =
    useState<Id<"users"> | null>(null);
  const [selectedCourseId, setSelectedCourseId] =
    useState<Id<"classes"> | null>(classIdParam);
  const [selectedGradeCode, setSelectedGradeCode] = useState<string | null>(
    null,
  );
  const [selectedKind, setSelectedKind] = useState<"all" | "class" | "event">(
    "all",
  );
  const [eventExplorerOpen, setEventExplorerOpen] = useState(false);
  const [eventExplorerLoaded, setEventExplorerLoaded] = useState(false);
  const [eventExplorerEventId, setEventExplorerEventId] =
    useState<Id<"events"> | null>(null);
  const [eventExplorerFocusRecordings, setEventExplorerFocusRecordings] =
    useState(false);
  const [eventExplorerRecordingId, setEventExplorerRecordingId] =
    useState<Id<"recordings"> | null>(null);

  function openEventExplorer(
    eventId: Id<"events"> | null = null,
    target?: "recordings",
  ) {
    setEventExplorerEventId(eventId);
    setEventExplorerFocusRecordings(target === "recordings");
    setEventExplorerRecordingId(null);
    setEventExplorerLoaded(true);
    setEventExplorerOpen(true);
  }

  const { user } = useCurrentUser();
  const { isLoaded: isClerkLoaded, isSignedIn, sessionClaims } = useAuth();
  const {
    isAuthenticated: isConvexAuthenticated,
    isLoading: isConvexAuthLoading,
  } = useConvexAuth();

  const router = useRouter();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const eventIdParam = searchParams.get("eventId") as Id<"events"> | null;
  const focusEventRecordings = searchParams.get("tab") === "recordings";
  const eventRecordingIdParam = searchParams.get(
    "recordingId",
  ) as Id<"recordings"> | null;
  const eventLink = eventIdParam
    ? `${eventIdParam}:${focusEventRecordings}:${eventRecordingIdParam ?? ""}`
    : null;
  const [previousEventLink, setPreviousEventLink] = useState<string | null>(
    null,
  );
  if (previousEventLink !== eventLink) {
    setPreviousEventLink(eventLink);
    if (eventIdParam) {
      setEventExplorerEventId(eventIdParam);
      setEventExplorerFocusRecordings(focusEventRecordings);
      setEventExplorerRecordingId(eventRecordingIdParam);
      setEventExplorerLoaded(true);
      setEventExplorerOpen(true);
    }
  }

  function handleEventExplorerOpenChange(open: boolean) {
    setEventExplorerOpen(open);
    if (open || !eventIdParam) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("eventId");
    next.delete("tab");
    next.delete("recordingId");
    const query = next.toString();
    router.replace(`/${orgSlug}/calendar${query ? `?${query}` : ""}`, {
      scroll: false,
    });
  }
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isStudent = role === "student";
  const mode = selectedMode ?? (isStudent ? "day" : "week");
  const isCalendarAuthReady =
    isClerkLoaded &&
    isSignedIn === true &&
    !isConvexAuthLoading &&
    isConvexAuthenticated;
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isCalendarAuthReady ? { slug: orgSlug } : "skip",
  );

  const { context: settingsContext } = useSettingsContext();
  const { access } = useStaffAccess();
  const canViewAllCampusCourses = access?.canManageCampus ?? false;
  const calendarSchoolId = settingsContext?.institution._id;
  const calendarCampusId =
    orgContext?.type === "campus"
      ? (orgContext._id as Id<"campuses">)
      : undefined;
  const closureSchoolId =
    orgContext?.type === "school"
      ? (orgContext._id as Id<"schools">)
      : orgContext?.type === "campus"
        ? calendarSchoolId
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
  const eventTeachers = useQuery(
    api.events.listTeacherOptions,
    canViewAllCampusCourses && calendarSchoolId && orgContext
      ? {
          schoolId: calendarSchoolId,
          campusId: calendarCampusId,
        }
      : "skip",
  );
  const teacherOptions = useMemo(() => {
    const values = new Map(
      [...(filterOptions?.teachers ?? []), ...(eventTeachers ?? [])].map(
        (teacher) => [
          teacher._id,
          { value: teacher._id, label: teacher.fullName },
        ],
      ),
    );
    return [...values.values()].sort((first, second) =>
      first.label.localeCompare(second.label),
    );
  }, [eventTeachers, filterOptions?.teachers]);
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
      filterOptions?.courses.flatMap(
        (course) =>
          course.gradeCodes ?? (course.gradeCode ? [course.gradeCode] : []),
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
    api.calendar.listEvents,
    orgContext && visibleRange
      ? {
          from: visibleRange.from,
          to: visibleRange.to - 1,
          ...(selectedCourseId ? { classId: selectedCourseId } : {}),
          ...(selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
          ...(selectedGradeCode ? { gradeCode: selectedGradeCode } : {}),
          ...(orgContext.type === "campus"
            ? { campusId: orgContext._id }
            : orgContext.type === "school"
              ? { schoolId: orgContext._id }
              : {}),
        }
      : "skip",
  );
  const {
    results: eventResults,
    status: eventStatus,
    loadMore: loadMoreEvents,
  } = usePaginatedQuery(
    api.events.listForCalendar,
    calendarSchoolId && visibleRange
      ? {
          schoolId: calendarSchoolId,
          campusId: calendarCampusId,
          scope: calendarCampusId ? "campus" : "school",
          from: visibleRange.from,
          to: visibleRange.to - 1,
          teacherId: selectedTeacherId ?? undefined,
          gradeCode: selectedGradeCode ?? undefined,
        }
      : "skip",
    { initialNumItems: 100 },
  );
  const {
    results: institutionEventResults,
    status: institutionEventStatus,
    loadMore: loadMoreInstitutionEvents,
  } = usePaginatedQuery(
    api.events.listForCalendar,
    calendarSchoolId && calendarCampusId && visibleRange
      ? {
          schoolId: calendarSchoolId,
          campusId: calendarCampusId,
          scope: "institution",
          from: visibleRange.from,
          to: visibleRange.to - 1,
          teacherId: selectedTeacherId ?? undefined,
          gradeCode: selectedGradeCode ?? undefined,
        }
      : "skip",
    { initialNumItems: 100 },
  );
  // shortcut: load the displayed date range; revisit if a month becomes slow.
  useEffect(() => {
    if (eventStatus === "CanLoadMore") loadMoreEvents(100);
  }, [eventStatus, loadMoreEvents]);
  useEffect(() => {
    if (institutionEventStatus === "CanLoadMore")
      loadMoreInstitutionEvents(100);
  }, [institutionEventStatus, loadMoreInstitutionEvents]);
  const closureResult = useQuery(
    api.calendarClosures.listForRange,
    closureSchoolId && visibleRange
      ? {
          schoolId: closureSchoolId,
          campusId: calendarCampusId,
          from: visibleRange.from,
          to: visibleRange.to,
        }
      : "skip",
  );
  const filtersScope = `${scopeKey ?? "unresolved"}:${classIdParam ?? "all"}`;
  const [previousFiltersScope, setPreviousFiltersScope] =
    useState(filtersScope);
  if (previousFiltersScope !== filtersScope) {
    setPreviousFiltersScope(filtersScope);
    setSelectedCourseId(classIdParam);
    setSelectedTeacherId(null);
    setSelectedGradeCode(null);
  }

  const scheduleData = useRetainedQueryResult(
    scheduleResult,
    scopeKey ?? "unresolved",
  );
  const eventData = useMemo(
    () =>
      eventStatus === "Exhausted" &&
      (!calendarCampusId || institutionEventStatus === "Exhausted")
        ? [...eventResults, ...institutionEventResults]
        : undefined,
    [
      calendarCampusId,
      eventResults,
      eventStatus,
      institutionEventResults,
      institutionEventStatus,
    ],
  );
  const tCalendar = useTranslations("calendar");

  const allEvents = useMemo(() => {
    if (!scheduleData || !displayTimeZone || !visibleRange) return [];

    const classes: CalendarEvent[] = scheduleData.map((e) => ({
      kind: "class",
      id: e.scheduleId,
      _id: e.scheduleId,
      scheduleId: e.scheduleId,
      classId: e.classId,
      curriculumId: e.curriculumId,
      teacherId: e.teacherId,
      teacherIds: e.teacherIds,
      isAssignedTeacher: e.isAssignedTeacher,
      gradeCodes: e.gradeCodes,
      gradeCode: e.gradeCode,
      gradeLabel:
        (e.gradeCodes ?? (e.gradeCode ? [e.gradeCode] : []))
          .map((code) => gradeNameByCode.get(code) ?? code)
          .join(", ") || undefined,
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
      recurrenceParentId: e.recurrenceParentId,
      cancellationReason: e.cancellationReason,
      teacherName: e.teacherName,
      teacherImageUrl: e.teacherImageUrl,
      canLeadSession: e.canLeadSession,
      hasRecording: e.hasRecording,
      hasPrerecorded: e.hasPrerecorded,
      canManagePrerecorded: e.canManagePrerecorded,
      sessionStartedAt: e.sessionStartedAt,
      sessionReopenUntil: e.sessionReopenUntil,
      sessionEndedAt: e.sessionEndedAt,
      sessionEndedByName: e.sessionEndedByName,
      sessionClosing: e.sessionClosing,
      sessionCloseRetrying: e.sessionCloseRetrying,
      sessionEndedAutomatically: e.sessionEndedAutomatically,
    }));
    const institutionEvents: CalendarEvent[] = (eventData ?? []).flatMap(
      (item) =>
        splitCalendarEventAcrossDays(
          {
            kind: "event",
            id: item._id,
            eventId: item.eventId,
            schoolId: item.event.schoolId,
            occurrenceId: item._id,
            title: item.event.title,
            description: item.event.description,
            start: new TZDate(item.start, displayTimeZone),
            end: new TZDate(item.end, displayTimeZone),
            actualStart: item.start,
            actualEnd: item.end,
            timeZone: item.event.timeZone,
            color: "amber",
            status: item.status,
            isLive: item.status === "active",
            sessionType: "live",
            roomName: item.roomName,
            gradeCodes: item.event.gradeCodes,
            gradeLabel: item.event.gradeCodes
              ?.map((code: string) => gradeNameByCode.get(code) ?? code)
              .join(", "),
            teacherIds: [item.event.responsibleId, ...item.event.teacherIds],
            responsibleName: item.event.responsibleName,
            campusId: item.event.campusId,
            campusName: item.event.campusName,
            canManage: item.event.canManage,
            canEdit: item.event.canEdit,
            canCancelOccurrence: item.event.canCancelOccurrence,
            cancellationReason: item.cancellationReason,
          } satisfies InstitutionalCalendarEvent,
          displayTimeZone,
        ),
    );
    return [
      ...classes,
      ...institutionEvents.filter(
        (event) =>
          event.start.getTime() < visibleRange.to &&
          event.end.getTime() > visibleRange.from,
      ),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [displayTimeZone, eventData, gradeNameByCode, scheduleData, visibleRange]);

  const filteredEvents = useMemo(() => {
    let result = allEvents.filter(
      (event) => selectedKind === "all" || event.kind === selectedKind,
    );

    if (selectedCourseId) {
      result = result.filter(
        (event) => event.kind === "class" && event.classId === selectedCourseId,
      );
    }

    if (selectedTeacherId) {
      result = result.filter((event) =>
        (event.kind === "event"
          ? event.teacherIds
          : (event.teacherIds ?? (event.teacherId ? [event.teacherId] : []))
        ).includes(selectedTeacherId),
      );
    }

    if (selectedGradeCode) {
      result = result.filter((event) =>
        event.kind === "event"
          ? !event.gradeCodes || event.gradeCodes.includes(selectedGradeCode)
          : (
              event.gradeCodes ?? (event.gradeCode ? [event.gradeCode] : [])
            ).includes(selectedGradeCode),
      );
    }

    return result;
  }, [
    allEvents,
    selectedCourseId,
    selectedGradeCode,
    selectedTeacherId,
    selectedKind,
  ]);
  const visibleClosures = useMemo(() => {
    if (!closureResult) return [];
    if (selectedGradeCode) {
      return closureResult.filter(
        (closure) =>
          !closure.gradeCode || closure.gradeCode === selectedGradeCode,
      );
    }
    if (canViewAllCampusCourses) return closureResult;
    const visibleGradeCodes = new Set(
      allEvents.flatMap((event) =>
        event.kind === "event"
          ? (event.gradeCodes ?? [])
          : (event.gradeCodes ?? (event.gradeCode ? [event.gradeCode] : [])),
      ),
    );
    return closureResult.filter(
      (closure) =>
        !closure.gradeCode || visibleGradeCodes.has(closure.gradeCode),
    );
  }, [allEvents, canViewAllCampusCourses, closureResult, selectedGradeCode]);
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
    scheduleData === undefined ||
    (calendarSchoolId && eventData === undefined)
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
              closures={visibleClosures}
              headerAction={
                <>
                  <CalendarEventActions
                    schoolId={calendarSchoolId}
                    campusId={calendarCampusId}
                    schoolTimeZone={
                      settingsContext?.institution.timeZone ??
                      schedulingTimeZone
                    }
                    selectedDate={dateInTimeZone(
                      date.getTime(),
                      schedulingTimeZone,
                    )}
                    canCreate={Boolean(
                      settingsContext?.canManageInstitution ||
                        access?.canManageCampus,
                    )}
                    canCreateInstitution={
                      settingsContext?.canManageInstitution ?? false
                    }
                    onViewEvents={() => openEventExplorer()}
                    onCreated={(eventId) => openEventExplorer(eventId)}
                  />
                  {access?.canManageCampus &&
                  closureSchoolId &&
                  schedulingTimeZone &&
                  orgContext?.type !== "system" ? (
                    <CalendarClosureDialog
                      schoolId={closureSchoolId}
                      campusId={calendarCampusId}
                      scopeLabel={orgContext?.name ?? ""}
                      schedulingTimeZone={schedulingTimeZone}
                      selectedDate={dateInTimeZone(
                        date.getTime(),
                        schedulingTimeZone,
                      )}
                    />
                  ) : undefined}
                </>
              }
              filters={{
                courses:
                  filterOptions?.courses.map((course) => ({
                    value: course._id,
                    label: course.name,
                  })) ?? [],
                teachers: teacherOptions,
                grades: gradeOptions,
                showTeacherFilter: canViewAllCampusCourses,
                showGradeFilter: !isStudent,
                selectedCourseId,
                selectedTeacherId,
                selectedGradeCode,
                selectedKind,
                onCourseChange: setSelectedCourseId,
                onTeacherChange: setSelectedTeacherId,
                onGradeChange: setSelectedGradeCode,
                onKindChange: (kind) => {
                  setSelectedKind(kind);
                  if (kind === "event") setSelectedCourseId(null);
                },
              }}
            />
          </TabsContent>

          <TabsContent
            value="agenda"
            className="flex-1 min-h-0 overflow-y-auto m-0 p-4 data-[state=active]:block"
          >
            <AgendaView
              filteredEvents={filteredEvents}
              isStudent={isStudent}
              now={now}
            />
          </TabsContent>
        </Tabs>

        <CalendarManageEventDialog
          canManageSeries={access?.canManageCampus ?? false}
        />
        <CalendarOccurrenceDialog onViewEvent={openEventExplorer} />
        {eventExplorerLoaded && (
          <CalendarEventExplorerDialog
            open={eventExplorerOpen}
            onOpenChange={handleEventExplorerOpenChange}
            orgSlug={orgSlug}
            initialEventId={eventExplorerEventId}
            focusRecordings={eventExplorerFocusRecordings}
            recordingId={eventExplorerRecordingId}
          />
        )}
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
