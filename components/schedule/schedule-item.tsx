"use client";

import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  MonitorPlay,
  Video,
  BookOpen,
  ArrowRight,
  Users,
  UserCheck,
  UserX,
  Clock,
  Link as LinkIcon,
  PlayCircle,
  ShieldCheck,
  ClipboardClock,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ManageScheduleDialog } from "@/components/teaching/classes/manage-schedule-dialog";
import { AttendanceDialog } from "@/components/teaching/classes/attendance-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { useState } from "react";
import { TZDate } from "@date-fns/tz";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

interface ScheduleItemProps {
  schedule: {
    scheduleId: Id<"classSchedule">;
    lessonIds?: Id<"lessons">[]; // ✅ Changed to array
    classId: Id<"classes">;
    title: string;
    description?: string;
    start: number | Date;
    end: number | Date;
    roomName: string;
    sessionType?: "live" | "ignitia" | "abeka";
    isLive?: boolean;
    status?: "scheduled" | "active" | "cancelled" | "completed";
    className?: string;
    curriculumTitle?: string;
    lessons?: {
      _id: Id<"lessons">;
      title: string;
      order: number;
    }[];
    attendanceSummary?: {
      present: number;
      partial: number;
      absent: number;
      excused: number;
      pendingVerification: number;
      verifiedTotal: number;
      total: number;
    };
    isRecurring?: boolean;
    recurrenceParentId?: Id<"classSchedule">;
    hasRecording?: boolean;
    timeZone: string;
  };
  classId?: Id<"classes">;
  isPast?: boolean;
  showDate?: boolean;
  showEdit?: boolean;
  showDescription?: boolean;
  variant?: "default" | "classSession";
  onEventClick?: () => void;
}

export function ScheduleItem({
  schedule,
  classId,
  isPast = false,
  showDate = true,
  showEdit = true,
  showDescription = true,
  variant = "default",
  onEventClick,
}: ScheduleItemProps) {
  const t = useTranslations();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const isIgnitia = schedule.sessionType === "ignitia";
  const isAbeka = schedule.sessionType === "abeka";
  const [recordingOpen, setRecordingOpen] = useState(false);

  // Convert to Date if needed
  const startDate = new TZDate(
    schedule.start instanceof Date ? schedule.start.getTime() : schedule.start,
    schedule.timeZone,
  );
  const endDate = new TZDate(
    schedule.end instanceof Date ? schedule.end.getTime() : schedule.end,
    schedule.timeZone,
  );

  const handleClick = () => {
    if (onEventClick) {
      onEventClick();
    }
  };

  const timeRange = `${format(startDate, "h:mm a", { locale: dateLocale })} - ${format(endDate, "h:mm a", { locale: dateLocale })} · ${schedule.timeZone}`;
  const platformLabel = isIgnitia
    ? "Ignitia"
    : isAbeka
      ? "Abeka"
      : t("schedule.platformLive");
  const linkedLessonCount =
    schedule.lessons?.length || schedule.lessonIds?.length || 0;
  const lessonContextLabel =
    linkedLessonCount > 0
      ? t("schedule.curriculumSession")
      : t("schedule.customSession");
  const classSessionTitle = (() => {
    if (!schedule.lessons || schedule.lessons.length === 0) {
      return schedule.title;
    }

    const sortedLessons = [...schedule.lessons].sort(
      (a, b) => a.order - b.order,
    );
    const firstLesson = sortedLessons[0];
    const lastLesson = sortedLessons[sortedLessons.length - 1];

    if (sortedLessons.length === 1) {
      return t("schedule.linkedLesson", {
        order: firstLesson.order,
        title: firstLesson.title,
      });
    }

    if (sortedLessons.length === 2) {
      return t("schedule.linkedLessonsPair", {
        startOrder: firstLesson.order,
        endOrder: lastLesson.order,
        firstTitle: firstLesson.title,
        secondTitle: lastLesson.title,
      });
    }

    return t("schedule.linkedLessonsSummary", {
      startOrder: firstLesson.order,
      endOrder: lastLesson.order,
      firstTitle: firstLesson.title,
      count: sortedLessons.length - 1,
    });
  })();
  const shouldShowDescription =
    showDescription && !!schedule.description && linkedLessonCount <= 1;
  const canOpenRoom = !isPast && schedule.status !== "cancelled";
  const canEditSchedule = classId && showEdit && canOpenRoom;
  const showRecordingAction = isPast && !!schedule.hasRecording;
  const canManageAttendance =
    classId &&
    showEdit &&
    isPast &&
    Boolean(schedule.attendanceSummary?.verifiedTotal);
  const primarySessionActionLabel = schedule.isLive
    ? t("classroom.joinLive")
    : isIgnitia || isAbeka
      ? t("schedule.openPlatform", { platform: platformLabel })
      : t("classroom.prepareRoom");

  const renderAttendanceSummaryContent = () => {
    if (!schedule.attendanceSummary) return null;
    const { present, partial, absent, excused, pendingVerification } =
      schedule.attendanceSummary;

    return (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-success">
                <UserCheck className="w-3.5 h-3.5" />
                <span>{present}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("schedule.attendance.present")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-warning">
                <Clock className="w-3.5 h-3.5" />
                <span>{partial}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("schedule.attendance.partial")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-destructive">
                <UserX className="w-3.5 h-3.5" />
                <span>{absent}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("schedule.attendance.absent")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-info">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{excused}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("schedule.attendance.excused")}</TooltipContent>
          </Tooltip>

          {pendingVerification > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ClipboardClock className="w-3.5 h-3.5" />
                  <span>{pendingVerification}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {t("schedule.attendance.pendingVerification")}
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </>
    );
  };

  const renderAttendanceSummary = () => {
    if (!schedule.attendanceSummary) return null;

    return (
      <div className="flex w-fit items-center gap-3 rounded-md bg-muted/30 p-1.5 text-xs font-medium text-muted-foreground">
        {renderAttendanceSummaryContent()}
      </div>
    );
  };

  if (variant === "classSession") {
    return (
      <div
        className={`flex flex-col gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between ${isPast ? "bg-muted/10 opacity-90" : ""} ${onEventClick ? "cursor-pointer" : ""}`}
        onClick={handleClick}
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          {showDate && (
            <div className="flex min-w-[60px] flex-col items-center justify-center rounded-md bg-muted p-2 text-center">
              <span className="text-xs font-bold uppercase text-muted-foreground">
                {format(startDate, "MMM", { locale: dateLocale })}
              </span>
              <span className="text-xl font-bold">
                {format(startDate, "d", { locale: dateLocale })}
              </span>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold leading-tight">
                {classSessionTitle}
              </h4>
              {schedule.isLive && (
                <Badge variant="destructive" className="animate-pulse shrink-0">
                  {t("common.live")}
                </Badge>
              )}
              {schedule.status === "cancelled" && (
                <Badge variant="secondary" className="shrink-0">
                  {t("schedule.cancelled")}
                </Badge>
              )}
            </div>

            <p className="mt-1 text-sm text-muted-foreground">
              {timeRange} · {lessonContextLabel}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("schedule.platform")}: {platformLabel}
            </p>

            {shouldShowDescription && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                {schedule.description}
              </p>
            )}

            {isPast && schedule.attendanceSummary && (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                {canManageAttendance ? (
                  <AttendanceDialog
                    scheduleId={schedule.scheduleId}
                    title={schedule.title}
                    trigger={
                      <button
                        type="button"
                        className="flex w-fit items-center gap-3 rounded-md bg-muted/30 p-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        aria-label={t("schedule.attendance.editLabel")}
                      >
                        {renderAttendanceSummaryContent()}
                        <div className="h-3 w-px bg-border mx-1" />
                        <span className="text-foreground">
                          {t("schedule.attendance.editAction")}
                        </span>
                      </button>
                    }
                  />
                ) : (
                  renderAttendanceSummary()
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          {showRecordingAction && (
            <>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setRecordingOpen(true)}
              >
                <PlayCircle className="h-4 w-4" />
                {t("recordings.watch")}
              </Button>
              <RecordingPlayerModal
                scheduleId={schedule.scheduleId}
                title={schedule.className || schedule.title}
                secondaryLabel={
                  isIgnitia ? "Ignitia" : isAbeka ? "Abeka" : undefined
                }
                scheduledStart={startDate.getTime()}
                scheduledEnd={endDate.getTime()}
                timeZone={schedule.timeZone}
                open={recordingOpen}
                onOpenChange={setRecordingOpen}
              />
            </>
          )}

          {!showRecordingAction && canOpenRoom && (
            <Button
              size="sm"
              variant={schedule.isLive ? "destructive" : "default"}
              asChild
            >
              <Link href={`/${orgSlug}/classroom/${schedule.roomName}`}>
                {schedule.isLive ? (
                  t("classroom.joinLive")
                ) : (
                  <>
                    {primarySessionActionLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Link>
            </Button>
          )}

          {canEditSchedule && (
            <ManageScheduleDialog
              classId={classId}
              scheduleId={schedule.scheduleId}
              initialData={{
                lessonIds: schedule.lessonIds,
                title: schedule.title,
                description: schedule.description,
                start: startDate.getTime(),
                end: endDate.getTime(),
                sessionType: schedule.sessionType || "live",
                isRecurring: schedule.isRecurring,
                recurrenceParentId: schedule.recurrenceParentId,
                timeZone: schedule.timeZone,
              }}
              trigger={
                <Button size="sm" variant="outline">
                  {t("common.edit")}
                </Button>
              }
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4 ${isPast ? "opacity-90 bg-muted/10" : ""} ${isIgnitia ? "bg-secondary/10 border-secondary/20" : ""} ${onEventClick ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-4 flex-1">
        {/* Date Badge */}
        {showDate && (
          <div
            className={`flex flex-col items-center justify-center min-w-[60px] text-center p-2 rounded-md ${
              isIgnitia ? "bg-secondary text-secondary-foreground" : "bg-muted"
            }`}
          >
            <span className="text-xs font-bold uppercase opacity-70">
              {format(startDate, "MMM", { locale: dateLocale })}
            </span>
            <span className="text-xl font-bold">
              {format(startDate, "d", { locale: dateLocale })}
            </span>
            <span className="text-xs opacity-70">
              {format(startDate, "h:mm a", { locale: dateLocale })}
            </span>
          </div>
        )}

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-0.5">
              {schedule.className && (
                <h4 className="font-semibold text-base">
                  {schedule.className}
                </h4>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={
                    schedule.className
                      ? "text-sm text-muted-foreground"
                      : "font-medium"
                  }
                >
                  {schedule.title}
                </span>
                {schedule.curriculumTitle && (
                  <span className="text-xs text-muted-foreground">
                    • {schedule.curriculumTitle}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {/* Session Type Badge */}
            {isIgnitia ? (
              <Badge
                variant="outline"
                className="shrink-0 text-secondary-foreground bg-secondary border-secondary"
              >
                <MonitorPlay className="h-3 w-3 mr-1" />
                Ignitia
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                <Video className="h-3 w-3 mr-1" />
                {t("schedule.typeLive")}
              </Badge>
            )}

            {/* ✅ Updated: Show lesson count instead of single lesson indicator */}
            {schedule.lessonIds && schedule.lessonIds.length > 0 ? (
              <Badge variant="outline" className="shrink-0">
                <LinkIcon className="h-3 w-3 mr-1" />
                {schedule.lessonIds.length}{" "}
                {schedule.lessonIds.length === 1
                  ? t("lesson.linked")
                  : t("lesson.lessonsLinked")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="shrink-0 border-dashed text-muted-foreground"
              >
                {t("lesson.noLesson")}
              </Badge>
            )}

            {/* Active Status */}
            {schedule.isLive &&
              (isIgnitia ? (
                <Badge className="shrink-0 bg-secondary text-secondary-foreground">
                  Active
                </Badge>
              ) : (
                <Badge variant="destructive" className="animate-pulse shrink-0">
                  {t("common.live")}
                </Badge>
              ))}

            {schedule.status === "cancelled" && (
              <Badge variant="secondary" className="shrink-0">
                {t("schedule.cancelled")}
              </Badge>
            )}
            {schedule.status === "completed" && (
              <Badge variant="secondary" className="shrink-0">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t("dashboard.completed")}
              </Badge>
            )}
            {schedule.hasRecording && (
              <Badge
                variant="outline"
                className="shrink-0 border-primary/50 text-primary bg-primary/5"
              >
                <PlayCircle className="h-3 w-3 mr-1" />
                {t("recordings.watch") || "Recording"}
              </Badge>
            )}
          </div>

          {/* ✅ NEW: Display linked lessons */}
          {schedule.lessons && schedule.lessons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {schedule.lessons.map((lesson) => (
                <Badge
                  key={lesson._id}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  {lesson.order}. {lesson.title}
                </Badge>
              ))}
            </div>
          )}

          {showDescription && schedule.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1.5">
              {schedule.description}
            </p>
          )}

          {/* Attendance Resume */}
          {renderAttendanceSummary()}

          <p className="text-xs text-muted-foreground mt-1.5">
            {format(startDate, "h:mm a", { locale: dateLocale })} -{" "}
            {format(endDate, "h:mm a", { locale: dateLocale })}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Recording Button — shown for completed sessions with a recording */}
        {schedule.hasRecording && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setRecordingOpen(true)}
            >
              <PlayCircle className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only sm:inline-block">
                {t("recordings.watch") || "Recording"}
              </span>
            </Button>
            <RecordingPlayerModal
              scheduleId={schedule.scheduleId}
              title={schedule.className || schedule.title}
              secondaryLabel={
                isIgnitia ? "Ignitia" : isAbeka ? "Abeka" : undefined
              }
              scheduledStart={startDate.getTime()}
              scheduledEnd={endDate.getTime()}
              timeZone={schedule.timeZone}
              open={recordingOpen}
              onOpenChange={setRecordingOpen}
            />
          </>
        )}

        {/* Attendance Button */}
        {classId && showEdit && (
          <AttendanceDialog
            scheduleId={schedule.scheduleId}
            title={schedule.title}
            trigger={
              <Button size="sm" variant="outline" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:inline-block">
                  Attendance
                </span>
              </Button>
            }
          />
        )}

        {!isPast && schedule.status !== "cancelled" && (
          <>
            {/* Edit Button */}
            {classId && showEdit && (
              <ManageScheduleDialog
                classId={classId}
                scheduleId={schedule.scheduleId}
                initialData={{
                  lessonIds: schedule.lessonIds,
                  title: schedule.title,
                  description: schedule.description,
                  start: startDate.getTime(),
                  end: endDate.getTime(),
                  sessionType: schedule.sessionType || "live",
                  isRecurring: schedule.isRecurring,
                  recurrenceParentId: schedule.recurrenceParentId,
                  timeZone: schedule.timeZone,
                }}
                trigger={
                  <Button size="sm" variant="outline">
                    {t("common.edit")}
                  </Button>
                }
              />
            )}

            {/* Session Button */}
            {schedule.isLive ? (
              <Button
                size="sm"
                variant={isIgnitia ? "default" : "destructive"}
                className={
                  isIgnitia
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    : ""
                }
                asChild
              >
                <Link href={`/${orgSlug}/classroom/${schedule.roomName}`}>
                  {isIgnitia ? "Open Class" : t("classroom.joinLive")}
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/${orgSlug}/classroom/${schedule.roomName}`}>
                  {isIgnitia ? (
                    <>
                      <MonitorPlay className="mr-2 h-4 w-4 text-secondary" />
                      Open Ignitia
                    </>
                  ) : (
                    <>
                      {t("classroom.prepareRoom")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Link>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
