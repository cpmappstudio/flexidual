"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TZDate } from "@date-fns/tz";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import {
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  ClipboardClock,
  Clock3,
  LoaderCircle,
  PencilLine,
  PlayCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { AttendanceRecordEditor } from "@/components/attendance/attendance-record-editor";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_APPEARANCE,
  AttendanceStatusBadge,
  type AttendanceStatus,
} from "@/components/attendance/attendance-status";
import {
  getSessionRecordings,
  useSessionRecord,
} from "@/components/classroom/session-record";
import { SessionCloseoutDialog } from "@/components/classroom/session-closeout-dialog";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { CurriculumIcon } from "@/components/teaching/curriculums/curriculum-icon";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type AttendanceHistoryItem = FunctionReturnType<
  typeof api.student.listStudentAttendanceHistory
>["page"][number];
type StudentDashboardData = NonNullable<
  FunctionReturnType<typeof api.student.getStudentDashboardStats>
>;
type PendingAttendanceSession =
  StudentDashboardData["pendingAttendanceSessions"][number];
type AttendanceFilter = AttendanceStatus | "all";
type HistoryMode = "verified" | "pending";
type AttendanceCounts = Record<AttendanceStatus, number>;
type CourseOption = { classId: Id<"classes">; className: string };

const INITIAL_HISTORY_SIZE = 12;
const ALL_COURSES = "all";
const dateLocales = { en: enUS, es, "pt-BR": ptBR } as const;

function AttendanceHistorySurface({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92dvh] max-h-[92dvh] gap-0 overflow-hidden overscroll-contain rounded-t-[2rem] p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30"
          />
          <SheetHeader className="border-b border-border/70 pr-12 text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function SessionDate({
  start,
  end,
  timeZone,
}: {
  start: number;
  end: number;
  timeZone: string;
}) {
  const locale = useLocale();
  const dateLocale = dateLocales[locale as keyof typeof dateLocales] ?? enUS;
  const sessionStart = new TZDate(start, timeZone);
  const sessionEnd = new TZDate(end, timeZone);

  return (
    <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
      <p className="flex items-center gap-2 capitalize">
        <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
        {format(sessionStart, "EEEE, MMMM d, yyyy", { locale: dateLocale })}
      </p>
      <p className="flex items-center gap-2">
        <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
        {format(sessionStart, "h:mm a", { locale: dateLocale })} –{" "}
        {format(sessionEnd, "h:mm a", { locale: dateLocale })} · {timeZone}
      </p>
    </div>
  );
}

function AttendanceHistoryRow({
  item,
  isEditing,
  isLoadingRecording,
  studentName,
  orgSlug,
  onToggleEditor,
  onWatchRecording,
}: {
  item: AttendanceHistoryItem;
  isEditing: boolean;
  isLoadingRecording: boolean;
  studentName: string;
  orgSlug: string;
  onToggleEditor: () => void;
  onWatchRecording: () => void;
}) {
  const t = useTranslations("student.attendanceHistory");
  const attendanceT = useTranslations("attendance.status");
  const sessionT = useTranslations("sessionRecord");
  const { lessonPreview, hasMoreLessons, recordingCount } = item.contentSummary;
  const showLessonPreview =
    lessonPreview &&
    lessonPreview.title.trim().toLocaleLowerCase() !==
      item.sessionTitle?.trim().toLocaleLowerCase();

  return (
    <article className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <CurriculumIcon
          iconKey={item.curriculumIconKey}
          className="size-11 shrink-0"
          size={44}
        />
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug text-foreground">
            {item.className}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {item.sessionTitle || t("sessionFallback")}
          </p>
        </div>
        {isEditing ? (
          <div className="col-span-2 mt-3 w-full rounded-2xl border bg-muted/20 p-3 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:w-80">
            <AttendanceRecordEditor
              scheduleId={item.scheduleId}
              studentId={item.studentId}
              studentName={studentName}
              status={item.status}
              excuseReason={item.excuseReason}
              onSaved={onToggleEditor}
              onCancel={onToggleEditor}
            />
          </div>
        ) : (
          <div className="col-span-2 mt-3 flex w-full min-w-0 flex-col items-stretch gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:justify-end">
            <AttendanceStatusBadge
              status={item.status}
              label={attendanceT(item.status)}
              className="justify-center sm:justify-start"
            />
            {item.canEditAttendance && (
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                aria-expanded={false}
                onClick={onToggleEditor}
              >
                <PencilLine className="size-4" aria-hidden="true" />
                {t("editAttendance")}
              </Button>
            )}
          </div>
        )}
        <div className="col-start-2 min-w-0 sm:col-span-2">
          <SessionDate
            start={item.start}
            end={item.end}
            timeZone={item.timeZone}
          />
          <p className="mt-1.5 text-xs font-medium text-foreground/75">
            {t("connectionTime", {
              attended: item.attendedMinutes,
              scheduled: item.scheduledMinutes,
            })}
          </p>
          {item.excuseReason && (
            <p className="mt-3 rounded-xl bg-info/10 px-3 py-2 text-xs text-info">
              {t("excuseReason", { reason: item.excuseReason })}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex min-w-0 max-w-full flex-wrap items-center gap-2 border-t pt-3">
        {showLessonPreview && (
          <div className="mr-2 flex min-w-0 items-center gap-2 text-sm">
            <BookOpenCheck
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="truncate font-medium">
              {lessonPreview.order}. {lessonPreview.title}
            </span>
            {hasMoreLessons && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("moreLessons")}
              </span>
            )}
          </div>
        )}
        {recordingCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLoadingRecording}
            onClick={onWatchRecording}
          >
            {isLoadingRecording ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <PlayCircle className="size-4" aria-hidden="true" />
            )}
            {sessionT("watchRecording")}
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link href={`/${orgSlug}/classes/${item.classId}`}>
            {t("viewCourse")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function PendingAttendanceRow({
  item,
  orgSlug,
  onCompleteReport,
}: {
  item: PendingAttendanceSession;
  orgSlug: string;
  onCompleteReport: () => void;
}) {
  const t = useTranslations("student.attendanceHistory");

  return (
    <article className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-warning/30 bg-warning/5 p-4 shadow-sm">
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <CurriculumIcon
          iconKey={item.curriculumIconKey}
          className="size-11 shrink-0"
          size={44}
        />
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug text-foreground">
            {item.className}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {item.sessionTitle || t("sessionFallback")}
          </p>
        </div>
        <div className="col-span-2 mt-3 flex w-full min-w-0 flex-col items-stretch gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:justify-end">
          <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning-foreground sm:justify-start">
            <ClipboardClock className="size-3.5" aria-hidden="true" />
            {t("pending")}
          </span>
          {item.canCompleteReport && (
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={onCompleteReport}
            >
              <PencilLine className="size-4" aria-hidden="true" />
              {t("completeRecord")}
            </Button>
          )}
        </div>
        <div className="col-start-2 min-w-0 sm:col-span-2">
          <SessionDate
            start={item.start}
            end={item.end}
            timeZone={item.timeZone}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("pendingDescription")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end border-t pt-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/${orgSlug}/classes/${item.classId}`}>
            {t("viewCourse")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function EmptyHistory({ mode }: { mode: HistoryMode }) {
  const t = useTranslations("student.attendanceHistory");
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <CalendarDays className="size-6" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-foreground">
          {t(mode === "pending" ? "pendingEmptyTitle" : "emptyTitle")}
        </p>
        <p className="mt-1 text-sm">
          {t(
            mode === "pending" ? "pendingEmptyDescription" : "emptyDescription",
          )}
        </p>
      </div>
    </div>
  );
}

export function StudentAttendanceSummary({
  counts,
  verifiedSessions,
  pendingVerification,
  pendingSessions = [],
  courses = [],
  studentId,
  studentName,
  orgSlug,
  hasProfileAction = false,
}: {
  counts: AttendanceCounts;
  verifiedSessions: number;
  pendingVerification: number;
  pendingSessions?: PendingAttendanceSession[];
  courses?: CourseOption[];
  studentId?: string;
  studentName: string;
  orgSlug: string;
  hasProfileAction?: boolean;
}) {
  const t = useTranslations();
  const historyT = useTranslations("student.attendanceHistory");
  const attendanceT = useTranslations("attendance.status");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<HistoryMode>("verified");
  const [filter, setFilter] = useState<AttendanceFilter>("all");
  const [courseFilter, setCourseFilter] = useState(ALL_COURSES);
  const [editingScheduleId, setEditingScheduleId] =
    useState<Id<"classSchedule">>();
  const [recordingScheduleId, setRecordingScheduleId] =
    useState<Id<"classSchedule">>();
  const [pendingCloseoutSession, setPendingCloseoutSession] =
    useState<PendingAttendanceSession>();
  const [recordingOpen, setRecordingOpen] = useState(false);
  const selectedClassId =
    courseFilter === ALL_COURSES ? undefined : (courseFilter as Id<"classes">);
  const queryArgs =
    open && mode === "verified"
      ? {
          ...(studentId ? { studentId, orgSlug } : {}),
          ...(filter === "all" ? {} : { status: filter }),
          ...(selectedClassId ? { classId: selectedClassId } : {}),
        }
      : "skip";
  const {
    results,
    status: queryStatus,
    loadMore,
  } = usePaginatedQuery(api.student.listStudentAttendanceHistory, queryArgs, {
    initialNumItems: INITIAL_HISTORY_SIZE,
  });
  const selectedRecordingItem = results.find(
    (item) => item.scheduleId === recordingScheduleId,
  );
  const sessionRecord = useSessionRecord(
    recordingScheduleId,
    selectedRecordingItem?.end,
    Boolean(open && recordingScheduleId),
  );
  const recordings = getSessionRecordings(sessionRecord);
  const visiblePendingSessions = selectedClassId
    ? pendingSessions.filter((item) => item.classId === selectedClassId)
    : pendingSessions;
  const courseOptions = useMemo(
    () => [
      { value: ALL_COURSES, label: historyT("allCourses") },
      ...courses.map((course) => ({
        value: course.classId,
        label: course.className,
      })),
    ],
    [courses, historyT],
  );

  useEffect(() => {
    if (
      open &&
      mode === "verified" &&
      results.length === 0 &&
      queryStatus === "CanLoadMore"
    ) {
      loadMore(INITIAL_HISTORY_SIZE);
    }
  }, [loadMore, mode, open, queryStatus, results.length]);

  useEffect(() => {
    if (!recordingScheduleId || sessionRecord === undefined) return;
    if (recordings.length > 0) setRecordingOpen(true);
    else {
      setRecordingScheduleId(undefined);
      toast.error(historyT("recordingUnavailable"));
    }
  }, [historyT, recordingScheduleId, recordings.length, sessionRecord]);

  const clearRowState = () => {
    setEditingScheduleId(undefined);
    setRecordingScheduleId(undefined);
  };

  const openHistory = (nextFilter: AttendanceFilter) => {
    setMode("verified");
    setFilter(nextFilter);
    setCourseFilter(ALL_COURSES);
    clearRowState();
    setOpen(true);
  };

  const openPendingHistory = () => {
    setMode("pending");
    setFilter("all");
    setCourseFilter(ALL_COURSES);
    clearRowState();
    setOpen(true);
  };

  const closeHistory = () => {
    setOpen(false);
    clearRowState();
  };

  const changeFilter = (value: AttendanceFilter) => {
    setFilter(value);
    clearRowState();
  };

  const changeCourse = (value: string) => {
    setCourseFilter(value || ALL_COURSES);
    clearRowState();
  };

  const toggleEditor = (scheduleId: Id<"classSchedule">) => {
    setEditingScheduleId((current) =>
      current === scheduleId ? undefined : scheduleId,
    );
  };

  const selectedTitle =
    selectedRecordingItem?.sessionTitle ||
    selectedRecordingItem?.className ||
    historyT("sessionFallback");
  const surfaceOpen = open && !recordingOpen && !pendingCloseoutSession;
  const isLoading = mode === "verified" && queryStatus === "LoadingFirstPage";
  const hasItems =
    mode === "pending" ? visiblePendingSessions.length > 0 : results.length > 0;

  return (
    <>
      <div className="min-w-0 xl:border-l xl:border-border/60 xl:pl-5">
        <div className={cn("mb-3 xl:mb-0", hasProfileAction && "xl:pr-28")}>
          <h3 className="text-sm font-bold text-foreground xl:text-xl">
            {t("student.profile.classAttendance")}
          </h3>
          <p className="mt-1 hidden text-sm font-medium text-muted-foreground xl:block">
            {verifiedSessions > 0
              ? t("student.profile.attendanceVerifiedSummary", {
                  verified: verifiedSessions,
                })
              : t("student.profile.noCompletedClassesYet")}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:mt-4 xl:gap-3">
          {ATTENDANCE_STATUSES.map((status) => {
            const appearance = ATTENDANCE_STATUS_APPEARANCE[status];
            const Icon = appearance.icon;
            const count = counts[status];
            const label = attendanceT(status);
            return (
              <button
                key={status}
                type="button"
                disabled={count === 0}
                aria-haspopup="dialog"
                aria-label={historyT("openStatusDetails", { count, label })}
                className={cn(
                  "group min-w-0 rounded-2xl px-2 py-2 text-center outline-none transition-[color,background-color,box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60 xl:flex xl:min-h-24 xl:flex-col xl:items-center xl:justify-center xl:py-3",
                  appearance.summaryClassName,
                )}
                onClick={() => openHistory(status)}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Icon
                    className="size-4 opacity-80 xl:size-5"
                    aria-hidden="true"
                  />
                  <span className="text-xl font-bold leading-none tabular-nums xl:text-3xl">
                    {count}
                  </span>
                </span>
                <span className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold leading-tight xl:mt-2 xl:text-sm">
                  {label}
                  {count > 0 && (
                    <ChevronRight
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {pendingVerification > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-left text-xs text-warning-foreground transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={openPendingHistory}
          >
            <span className="inline-flex items-center gap-2">
              <ClipboardClock className="size-4 shrink-0" aria-hidden="true" />
              {t("student.profile.pendingVerificationSummary", {
                count: pendingVerification,
              })}
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      <AttendanceHistorySurface
        open={surfaceOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !recordingOpen) closeHistory();
        }}
        title={historyT(mode === "pending" ? "pendingTitle" : "title")}
        description={historyT(
          mode === "pending" ? "pendingDialogDescription" : "description",
          { student: studentName },
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b px-4 py-3 sm:px-6">
            <div
              className={cn(
                "grid gap-3",
                mode === "verified" && "sm:grid-cols-2",
              )}
            >
              {mode === "verified" && (
                <div className="space-y-1.5">
                  <Label htmlFor="attendance-status-filter">
                    {historyT("statusFilter")}
                  </Label>
                  <Select
                    value={filter}
                    onValueChange={(value) =>
                      changeFilter(value as AttendanceFilter)
                    }
                  >
                    <SelectTrigger id="attendance-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{historyT("all")}</SelectItem>
                      {ATTENDANCE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {attendanceT(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{historyT("courseFilter")}</Label>
                <Combobox
                  options={courseOptions}
                  value={courseFilter}
                  onValueChange={changeCourse}
                  placeholder={historyT("allCourses")}
                  searchPlaceholder={historyT("searchCourses")}
                  emptyText={historyT("noCourses")}
                  ariaLabel={historyT("courseFilter")}
                  className="h-9 bg-sidebar font-normal"
                />
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 min-w-0 flex-1 touch-pan-y overscroll-contain">
            {isLoading ? (
              <div className="min-w-0 space-y-3 p-4 sm:p-6">
                <Skeleton className="h-52 rounded-2xl" />
                <Skeleton className="h-52 rounded-2xl" />
              </div>
            ) : !hasItems ? (
              <EmptyHistory mode={mode} />
            ) : (
              <div className="min-w-0 space-y-3 p-4 sm:p-6">
                {mode === "pending"
                  ? visiblePendingSessions.map((item) => (
                      <PendingAttendanceRow
                        key={item.scheduleId}
                        item={item}
                        orgSlug={orgSlug}
                        onCompleteReport={() => setPendingCloseoutSession(item)}
                      />
                    ))
                  : results.map((item) => (
                      <AttendanceHistoryRow
                        key={item.scheduleId}
                        item={item}
                        isEditing={editingScheduleId === item.scheduleId}
                        isLoadingRecording={
                          recordingScheduleId === item.scheduleId &&
                          sessionRecord === undefined
                        }
                        studentName={studentName}
                        orgSlug={orgSlug}
                        onToggleEditor={() => toggleEditor(item.scheduleId)}
                        onWatchRecording={() => {
                          setEditingScheduleId(undefined);
                          setRecordingScheduleId(item.scheduleId);
                        }}
                      />
                    ))}
                {mode === "verified" &&
                  (queryStatus === "CanLoadMore" ||
                    queryStatus === "LoadingMore") && (
                    <div className="flex justify-center pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={queryStatus === "LoadingMore"}
                        onClick={() => loadMore(INITIAL_HISTORY_SIZE)}
                      >
                        {queryStatus === "LoadingMore" && (
                          <LoaderCircle
                            className="animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {historyT("loadMore")}
                      </Button>
                    </div>
                  )}
              </div>
            )}
          </ScrollArea>
        </div>
      </AttendanceHistorySurface>

      {selectedRecordingItem && recordings.length > 0 && (
        <RecordingPlayerModal
          scheduleId={selectedRecordingItem.scheduleId}
          title={selectedTitle}
          secondaryLabel={selectedRecordingItem.className}
          scheduledStart={selectedRecordingItem.start}
          scheduledEnd={selectedRecordingItem.end}
          timeZone={selectedRecordingItem.timeZone}
          open={recordingOpen}
          onOpenChange={(nextOpen) => {
            setRecordingOpen(nextOpen);
            if (!nextOpen) setRecordingScheduleId(undefined);
          }}
          recordings={recordings}
          variant={studentId ? "default" : "student"}
        />
      )}
      {pendingCloseoutSession && (
        <SessionCloseoutDialog
          open
          roomName={pendingCloseoutSession.roomName}
          sessionNow={pendingCloseoutSession.end}
          alreadyEnded
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingCloseoutSession(undefined);
          }}
          onComplete={() => {
            setPendingCloseoutSession(undefined);
            toast.success(t("classroom.closeout.recoverySaved"));
          }}
        />
      )}
    </>
  );
}
