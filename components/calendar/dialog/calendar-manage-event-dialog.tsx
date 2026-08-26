"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Loader2,
  MoveRight,
  PlayCircle,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { RocketLaunchButtonContent } from "@/components/student/rocket-transition";
import { SessionCloseoutDialog } from "@/components/classroom/session-closeout-dialog";
import { getCalendarEventPrimaryAction } from "@/lib/calendar-event-action";
import { getErrorMessage, parseConvexError } from "@/lib/error-utils";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCalendarCancellationCapabilities } from "../calendar-cancellation";
import { useCalendarContext } from "../calendar-context";
import { getCalendarEventDisplay } from "../calendar-event-display";
import { CalendarProviderBadge } from "../calendar-provider-badge";

type CancellationScope = "single" | "series";

export default function CalendarManageEventDialog({
  canManageSeries = false,
}: {
  canManageSeries?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const now = useCurrentMinute();
  const isMobile = useIsMobile();
  const {
    manageEventDialogOpen,
    setManageEventDialogOpen,
    selectedEvent,
    setSelectedEvent,
    displayTimeZone,
    isStudent,
    userId,
  } = useCalendarContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationScope, setCancellationScope] =
    useState<CancellationScope>("single");
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [isClassroomLaunching, setIsClassroomLaunching] = useState(false);
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params.orgSlug as string) || "system";
  const cancelSchedule = useMutation(api.schedule.cancelSchedule);
  const recoveryContext = useQuery(
    api.schedule.getSessionClosureContext,
    !isStudent &&
      selectedEvent?.status === "completed" &&
      selectedEvent.roomName
      ? { roomName: selectedEvent.roomName, now }
      : "skip",
  );

  useEffect(() => {
    setCancellationReason("");
    setCancellationScope("single");
    setCancelDialogOpen(false);
    setCloseoutOpen(false);
  }, [selectedEvent?.scheduleId]);

  if (!selectedEvent) return null;

  const isSeries =
    selectedEvent.isRecurring || !!selectedEvent.recurrenceParentId;
  const cancellationCapabilities = getCalendarCancellationCapabilities({
    canManageSeries,
    currentUserId: userId,
    teacherId: selectedEvent.teacherId,
    status: selectedEvent.status,
    start: selectedEvent.start.getTime(),
    now,
    isLive: selectedEvent.isLive,
    isRecurring: isSeries,
  });
  const duration = Math.round(
    (selectedEvent.end.getTime() - selectedEvent.start.getTime()) / 60_000,
  );
  const { primaryLabel, secondaryLabel, gradeLabel } = getCalendarEventDisplay(
    selectedEvent,
    { showGrade: !isStudent },
  );
  const hasAssignedTeacher =
    Boolean(selectedEvent.teacherName) &&
    selectedEvent.teacherName !== "Unknown";
  const secondaryText = hasAssignedTeacher
    ? `${t("common.with")} ${secondaryLabel}`
    : selectedEvent.sessionType === "live"
      ? secondaryLabel
      : null;
  const displayDate = selectedEvent.start.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: displayTimeZone,
  });
  const displayStartTime = selectedEvent.start.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: displayTimeZone,
  });
  const displayEndTime = selectedEvent.end.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: displayTimeZone,
  });
  const primaryAction = getCalendarEventPrimaryAction({
    isStudent: Boolean(isStudent),
    now,
    start: selectedEvent.start.getTime(),
    end: selectedEvent.end.getTime(),
    status: selectedEvent.status,
    isLive: selectedEvent.isLive,
    hasRecording: selectedEvent.hasRecording,
    roomName: selectedEvent.roomName,
  });
  const canWatchRecording = primaryAction === "watch-recording";
  const classroomHref = `/${orgSlug}/classroom/${selectedEvent.roomName}`;

  function handleClose() {
    setIsClassroomLaunching(false);
    setManageEventDialogOpen(false);
    setTimeout(() => setSelectedEvent(null), 300);
  }

  function handleClassroomLaunchComplete() {
    handleClose();
    router.push(classroomHref);
  }

  async function handleCancellation() {
    const reason = cancellationReason.trim();
    const scheduleId = selectedEvent?.scheduleId;
    if (!reason || !scheduleId) return;

    setIsSubmitting(true);
    try {
      await cancelSchedule({
        id: scheduleId,
        cancelSeries: cancellationScope === "series",
        reason,
      });
      toast.success(
        cancellationScope === "series"
          ? t("schedule.seriesCancelled")
          : t("schedule.classCancelled"),
      );
      setCancelDialogOpen(false);
      handleClose();
    } catch (error) {
      const parsedError = parseConvexError(error);
      toast.error(
        parsedError
          ? getErrorMessage(parsedError, t, locale)
          : t("errors.operationFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const classIdentity = (
    <div className="min-w-0">
      <h2 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
        {primaryLabel}
        {gradeLabel && ` (${gradeLabel})`}
      </h2>
      {(secondaryText || selectedEvent.sessionType) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {secondaryText && (
            <p className="text-sm text-muted-foreground">{secondaryText}</p>
          )}
          <CalendarProviderBadge sessionType={selectedEvent.sessionType} />
        </div>
      )}
      {(selectedEvent.isLive || selectedEvent.status === "cancelled") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge
            variant="destructive"
            className={selectedEvent.isLive ? "animate-pulse" : undefined}
          >
            {selectedEvent.isLive ? t("common.live") : t("calendar.cancelled")}
          </Badge>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog
        open={manageEventDialogOpen && !(isMobile && recordingOpen)}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent
          className="max-h-[90vh] max-w-xl gap-0 overflow-x-hidden overflow-y-auto p-0"
          showCloseButton={false}
        >
          <DialogHeader className="relative flex flex-row items-start justify-between gap-3 space-y-0 overflow-hidden border-b border-primary/20 bg-gradient-to-br from-primary/15 via-background to-secondary/15 px-6 py-4 pr-14 text-left">
            <div className="min-w-0 flex-1">
              <DialogTitle className="sr-only">{primaryLabel}</DialogTitle>
              <div className="flex min-w-0 items-start gap-4 sm:gap-5">
                <Image
                  src="/classes-icon.svg"
                  alt=""
                  width={40}
                  height={48}
                  aria-hidden="true"
                  className="pointer-events-none h-12 w-auto shrink-0 select-none"
                />
                <div className="min-w-0 flex-1">{classIdentity}</div>
              </div>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 text-muted-foreground hover:bg-background/70 hover:text-foreground"
                aria-label={t("common.close")}
              >
                <X className="size-5" />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="w-full min-w-0 space-y-5 px-6 pb-6 pt-5">
            <div className="divide-y divide-border/70 border-y border-border/70 text-sm">
              <div className="flex min-w-0 items-center gap-3 py-3">
                <CalendarDays className="size-5 shrink-0 text-primary" />
                <p className="font-semibold text-foreground">{displayDate}</p>
              </div>
              <div className="flex min-w-0 items-center gap-3 py-3">
                <Clock3 className="size-5 shrink-0 text-primary" />
                <p className="font-semibold text-foreground">
                  {displayStartTime} - {displayEndTime}
                  {!isStudent && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({duration} {t("schedule.minutes")})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {selectedEvent.status === "cancelled" &&
              selectedEvent.cancellationReason && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {t("schedule.cancellationReason")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedEvent.cancellationReason}
                  </p>
                </div>
              )}

            <DialogFooter className="gap-2 sm:flex-row sm:items-center sm:justify-between">
              {recoveryContext?.canClose &&
                recoveryContext.closureStatus !== "completed" && (
                  <Button
                    variant="outline"
                    className="h-11 w-full gap-2 border-warning/50 text-warning-foreground hover:bg-warning/10 sm:w-auto"
                    onClick={() => setCloseoutOpen(true)}
                  >
                    <ClipboardCheck className="size-4" />
                    {t("classroom.closeout.completePendingReport")}
                  </Button>
                )}
              {cancellationCapabilities.canCancelOccurrence && (
                <Button
                  variant="outline"
                  className="h-11 w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <XCircle className="size-4" />
                  {t("schedule.cancelClass")}
                </Button>
              )}
              {canWatchRecording ? (
                <Button
                  className="h-11 w-full gap-2 sm:w-auto sm:min-w-44"
                  onClick={() => setRecordingOpen(true)}
                >
                  <PlayCircle className="size-4" />
                  {t("recordings.watchRecording")}
                </Button>
              ) : primaryAction === "go-to-classroom" ? (
                <Button
                  className="group relative h-11 w-full overflow-hidden sm:w-auto sm:min-w-44"
                  asChild
                >
                  <Link
                    href={classroomHref}
                    aria-busy={isClassroomLaunching}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!isClassroomLaunching) setIsClassroomLaunching(true);
                    }}
                  >
                    <RocketLaunchButtonContent
                      label={t("dashboard.goToClassroom")}
                      isLaunching={isClassroomLaunching}
                      onComplete={handleClassroomLaunchComplete}
                    />
                  </Link>
                </Button>
              ) : primaryAction === "enter-live" ? (
                <Button
                  className="h-11 w-full gap-2 bg-success text-success-foreground hover:bg-success/90 sm:w-auto sm:min-w-44"
                  asChild
                >
                  <Link href={classroomHref}>
                    {t("dashboard.enterLive")}
                    <MoveRight className="size-4" />
                  </Link>
                </Button>
              ) : primaryAction === "prepare-room" ? (
                <Button
                  className="h-11 w-full gap-2 sm:w-auto sm:min-w-44"
                  asChild
                >
                  <Link href={classroomHref}>
                    {t("classroom.prepareRoom")}
                    <MoveRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {canWatchRecording && (
        <RecordingPlayerModal
          scheduleId={selectedEvent.scheduleId}
          title={primaryLabel}
          secondaryLabel={secondaryLabel}
          gradeLabel={gradeLabel}
          scheduledStart={selectedEvent.start.getTime()}
          scheduledEnd={selectedEvent.end.getTime()}
          timeZone={displayTimeZone}
          open={recordingOpen}
          onOpenChange={setRecordingOpen}
          variant={isStudent ? "student" : "default"}
        />
      )}

      {selectedEvent.roomName && (
        <SessionCloseoutDialog
          open={closeoutOpen}
          roomName={selectedEvent.roomName}
          sessionNow={now}
          alreadyEnded
          onOpenChange={setCloseoutOpen}
          onComplete={() => {
            setCloseoutOpen(false);
            toast.success(t("classroom.closeout.recoverySaved"));
          }}
        />
      )}

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("schedule.cancelClass")}</AlertDialogTitle>
          </AlertDialogHeader>

          <AlertDialogDescription asChild>
            <div className="rounded-md border bg-muted/40 p-3 text-left">
              <p className="font-semibold text-foreground">
                {primaryLabel}
                {gradeLabel && ` (${gradeLabel})`}
              </p>
              <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 shrink-0 text-primary" />
                  <span>{displayDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="size-4 shrink-0 text-primary" />
                  <span>
                    {displayStartTime} - {displayEndTime}
                  </span>
                </div>
              </div>
            </div>
          </AlertDialogDescription>

          {cancellationCapabilities.canCancelSeries && (
            <div className="space-y-3">
              <Label>{t("schedule.cancellationScope")}</Label>
              <RadioGroup
                value={cancellationScope}
                onValueChange={(value) =>
                  setCancellationScope(value as CancellationScope)
                }
                className="gap-2"
              >
                <Label className="cursor-pointer items-start rounded-md border p-3 font-normal">
                  <RadioGroupItem value="single" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">
                      {t("schedule.cancelThisClass")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("schedule.cancelThisClassDescription")}
                    </span>
                  </span>
                </Label>
                <Label className="cursor-pointer items-start rounded-md border p-3 font-normal">
                  <RadioGroupItem value="series" className="mt-0.5" />
                  <span>
                    <span className="block font-medium">
                      {t("schedule.cancelFutureSeries")}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("schedule.cancelFutureSeriesDescription")}
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cancellation-reason">
              {t("schedule.cancellationReason")}
            </Label>
            <Textarea
              id="cancellation-reason"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder={t("schedule.cancellationReasonPlaceholder")}
              aria-invalid={
                cancelDialogOpen && cancellationReason.trim().length === 0
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("schedule.cancellationReasonHelp")}
            </p>
          </div>

          <AlertDialogFooter className="flex-col-reverse sm:flex-row">
            <AlertDialogCancel
              className="w-full sm:w-auto"
              disabled={isSubmitting}
            >
              {t("schedule.keepClass")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleCancellation}
              disabled={isSubmitting || cancellationReason.trim().length === 0}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {cancellationScope === "series"
                ? t("schedule.confirmSeriesCancellation")
                : t("schedule.confirmClassCancellation")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
