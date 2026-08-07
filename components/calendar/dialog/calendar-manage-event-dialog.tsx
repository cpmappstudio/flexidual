"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useState, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  FormLabel,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalendarContext } from "../calendar-context";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
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
import {
  Loader2,
  Trash2,
  MoveRight,
  Pencil,
  CalendarDays,
  Clock3,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarEvent } from "../calendar-types";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { useParams, useRouter } from "next/navigation";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { utcToLocalDateTime } from "@/lib/time-zone";
import { getCalendarEventDisplay } from "../calendar-event-display";
import { CalendarProviderBadge } from "../calendar-provider-badge";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCalendarEventPrimaryAction } from "@/lib/calendar-event-action";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { RocketLaunchButtonContent } from "@/components/student/rocket-transition";

const formSchema = z.object({
  title: z.string().optional(),
  start: z.string(),
  duration: z.number().min(15).max(240),
  sessionType: z.enum(["live", "ignitia", "abeka"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function CalendarManageEventDialog({
  readOnly = false,
}: {
  readOnly?: boolean;
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
  } = useCalendarContext();

  const [isEditing, setIsEditing] = useState(false);
  const [updateMode, setUpdateMode] = useState<"single" | "series">("single");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [isClassroomLaunching, setIsClassroomLaunching] = useState(false);

  const lastEventIdRef = useRef<string | null>(null);

  const params = useParams();
  const router = useRouter();
  const orgSlug = (params.orgSlug as string) || "system";

  const updateSchedule = useMutation(api.schedule.updateSchedule);
  const deleteSchedule = useMutation(api.schedule.deleteSchedule);

  const defaultValues = useMemo(() => {
    if (!selectedEvent) {
      return {
        title: "",
        start: new Date().toISOString().slice(0, 16),
        duration: 60,
        sessionType: "live" as const,
      };
    }

    const durationMs =
      selectedEvent.end.getTime() - selectedEvent.start.getTime();

    return {
      title: selectedEvent.title,
      start: utcToLocalDateTime(
        selectedEvent.start.getTime(),
        selectedEvent.timeZone,
      ),
      duration: Math.round(durationMs / (60 * 1000)),
      sessionType: (selectedEvent as CalendarEvent).sessionType || "live",
    };
  }, [selectedEvent]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    values: defaultValues,
  });

  const eventDuration = useMemo(() => {
    if (!selectedEvent) return 60;
    const durationMs =
      selectedEvent.end.getTime() - selectedEvent.start.getTime();
    return Math.round(durationMs / (60 * 1000));
  }, [selectedEvent]);

  useEffect(() => {
    if (
      manageEventDialogOpen &&
      selectedEvent &&
      selectedEvent.scheduleId !== lastEventIdRef.current &&
      !isEditing
    ) {
      lastEventIdRef.current = selectedEvent.scheduleId;

      form.reset({
        title: selectedEvent.title,
        start: utcToLocalDateTime(
          selectedEvent.start.getTime(),
          selectedEvent.timeZone,
        ),
        duration: eventDuration,
        sessionType: (selectedEvent as CalendarEvent).sessionType || "live",
      });
      setUpdateMode("single");
    }
  }, [manageEventDialogOpen, selectedEvent, form, eventDuration, isEditing]);

  async function onSubmit(values: FormValues) {
    if (!selectedEvent?.scheduleId) return;

    setIsSubmitting(true);
    try {
      await updateSchedule({
        id: selectedEvent.scheduleId,
        title: values.title,
        localStart: values.start,
        durationMinutes: values.duration,
        sessionType: values.sessionType,
        updateSeries: updateMode === "series",
      });

      toast.success(t("schedule.scheduleUpdated"));
      handleClose();
    } catch (error) {
      const parsedError = parseConvexError(error);

      if (parsedError) {
        const errorMessage = getErrorMessage(parsedError, t, locale);
        toast.error(errorMessage);
      } else {
        toast.error(t("errors.operationFailed"));
        console.error("Unexpected error:", error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(deleteSeries: boolean) {
    if (!selectedEvent?.scheduleId) return;
    setIsSubmitting(true);
    try {
      await deleteSchedule({
        id: selectedEvent.scheduleId,
        deleteSeries: deleteSeries,
      });

      toast.success(t("schedule.deleted"));
      setDeleteDialogOpen(false);
      handleClose();
    } catch (error) {
      const parsedError = parseConvexError(error);
      if (parsedError) {
        toast.error(getErrorMessage(parsedError, t, locale));
      } else {
        toast.error(t("errors.operationFailed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setIsClassroomLaunching(false);
    setManageEventDialogOpen(false);
    setTimeout(() => {
      setSelectedEvent(null);
      setIsEditing(false);
      lastEventIdRef.current = null;
    }, 300);
  }

  if (!selectedEvent) return null;

  const isSeries =
    selectedEvent.isRecurring || !!selectedEvent.recurrenceParentId;
  const duration = Math.round(
    (selectedEvent.end.getTime() - selectedEvent.start.getTime()) / (60 * 1000),
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

  function handleClassroomLaunchComplete() {
    handleClose();
    router.push(classroomHref);
  }

  const providerBadge = (
    <CalendarProviderBadge sessionType={selectedEvent.sessionType} />
  );
  const classIdentity = (
    <div className="min-w-0">
      <h2 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
        {primaryLabel}
        {gradeLabel && ` (${gradeLabel})`}
      </h2>
      {(secondaryText || providerBadge) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {secondaryText && (
            <p className="text-sm text-muted-foreground">{secondaryText}</p>
          )}
          {providerBadge}
        </div>
      )}
      {selectedEvent.isLive && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="destructive" className="animate-pulse">
            <span className="relative mr-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive-foreground opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive-foreground" />
            </span>
            {t("common.live")}
          </Badge>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog
        open={manageEventDialogOpen && !(isMobile && recordingOpen)}
        onOpenChange={handleClose}
      >
        <DialogContent
          className={cn(
            "max-h-[90vh] max-w-xl overflow-x-hidden overflow-y-auto",
            !isEditing && "gap-0 p-0",
          )}
          showCloseButton={false}
        >
          <DialogHeader
            className={cn(
              "flex flex-row items-start justify-between gap-3 space-y-0",
              !isEditing &&
                "relative overflow-hidden border-b border-primary/20 bg-gradient-to-br from-primary/15 via-background to-secondary/15 px-6 py-4 text-left",
            )}
          >
            {!isEditing ? (
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
            ) : (
              <DialogTitle>
                {isEditing ? t("common.edit") : t("schedule.viewDetails")}
              </DialogTitle>
            )}

            {!isStudent &&
              !readOnly &&
              selectedEvent.status !== "cancelled" && (
                <div className="flex gap-2">
                  {isEditing ? (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
          </DialogHeader>

          {!isEditing ? (
            /* VIEW MODE */
            <div className="w-full min-w-0 space-y-5 px-6 pb-6 pt-5">
              <div className="divide-y divide-border/70 border-y border-border/70 text-sm">
                <div className="flex min-w-0 items-center gap-3 py-3">
                  <CalendarDays className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {displayDate}
                    </p>
                  </div>
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

              {/* Action Button */}
              <DialogFooter className="gap-2 sm:flex-col-reverse sm:justify-start">
                <Button
                  variant="ghost"
                  className="h-10 w-full"
                  onClick={handleClose}
                >
                  {t("common.close")}
                </Button>
                {canWatchRecording ? (
                  <Button
                    className="h-11 w-full gap-2"
                    onClick={() => setRecordingOpen(true)}
                  >
                    <PlayCircle className="h-4 w-4" />
                    {t("recordings.watchRecording")}
                  </Button>
                ) : primaryAction === "go-to-classroom" ? (
                  <Button
                    className="group relative h-11 w-full overflow-hidden"
                    asChild
                  >
                    <Link
                      href={classroomHref}
                      aria-busy={isClassroomLaunching}
                      onClick={(event) => {
                        event.preventDefault();
                        if (isClassroomLaunching) return;
                        setIsClassroomLaunching(true);
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
                    className="h-11 w-full gap-2 bg-success text-success-foreground hover:bg-success/90"
                    asChild
                  >
                    <Link
                      href={`/${orgSlug}/classroom/${selectedEvent.roomName}`}
                    >
                      {t("dashboard.enterLive")}
                      <MoveRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : primaryAction === "prepare-room" ? (
                  <Button className="h-11 w-full gap-2" asChild>
                    <Link
                      href={`/${orgSlug}/classroom/${selectedEvent.roomName}`}
                    >
                      {t("classroom.prepareRoom")}
                      <MoveRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </DialogFooter>
            </div>
          ) : (
            /* EDIT MODE */
            <Form {...form} key={selectedEvent.scheduleId}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4 w-full min-w-0"
              >
                {/* Series vs Single Logic */}
                {isSeries && (
                  <div className="bg-warning/10 p-4 rounded-md border border-warning/30 space-y-3">
                    <FormLabel className="text-base font-semibold text-warning-foreground">
                      {t("schedule.updateSchedule") || "Update Scope"}
                    </FormLabel>

                    <RadioGroup
                      value={updateMode}
                      onValueChange={(value) =>
                        setUpdateMode(value as "single" | "series")
                      }
                      className="flex flex-col gap-3"
                    >
                      <div className="flex items-start space-x-3 p-3 rounded-md border border-warning/30 bg-background cursor-pointer hover:bg-warning/10 transition-colors">
                        <RadioGroupItem
                          value="single"
                          id="r1"
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <FormLabel
                            htmlFor="r1"
                            className="font-medium cursor-pointer"
                          >
                            {t("schedule.editOccurrence") || "Just this class"}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("schedule.editOccurrenceDesc") ||
                              "Changes only affect this class."}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-3 rounded-md border border-warning/30 bg-background cursor-pointer hover:bg-warning/10 transition-colors">
                        <RadioGroupItem
                          value="series"
                          id="r2"
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <FormLabel
                            htmlFor="r2"
                            className="font-medium cursor-pointer"
                          >
                            {t("schedule.editSeries") || "All future classes"}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("schedule.editSeriesDesc") ||
                              "Changes affect this and all future classes in the series."}
                          </p>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* Session Type */}
                <FormField
                  control={form.control}
                  name="sessionType"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>{t("schedule.sessionType")}</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex flex-row space-x-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="live" id="edit-live" />
                            <FormLabel
                              htmlFor="edit-live"
                              className="font-normal cursor-pointer"
                            >
                              {t("schedule.typeLive")}
                            </FormLabel>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="ignitia" id="edit-ignitia" />
                            <FormLabel
                              htmlFor="edit-ignitia"
                              className="font-normal cursor-pointer"
                            >
                              {t("schedule.typeIgnitia")}
                            </FormLabel>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="abeka" id="edit-abeka" />
                            <FormLabel
                              htmlFor="edit-abeka"
                              className="font-normal cursor-pointer"
                            >
                              {t("schedule.typeAbeka")}
                            </FormLabel>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Title */}
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("schedule.title") || "Title"}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Start Time & Duration */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("schedule.dateTime")}</FormLabel>
                        <DateTimePicker
                          field={field}
                          timeZone={selectedEvent.timeZone}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("schedule.duration")}</FormLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={(v) => field.onChange(Number(v))}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="30">
                              30 {t("schedule.minutes")}
                            </SelectItem>
                            <SelectItem value="45">
                              45 {t("schedule.minutes")}
                            </SelectItem>
                            <SelectItem value="60">
                              1 {t("schedule.hour")}
                            </SelectItem>
                            <SelectItem value="90">
                              1.5 {t("schedule.hours")}
                            </SelectItem>
                            <SelectItem value="120">
                              2 {t("schedule.hours")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsEditing(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isSeries
                ? t("schedule.deleteSeriesPrompt")
                : t("schedule.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isSubmitting}>
              {t("common.cancel")}
            </AlertDialogCancel>

            {isSeries ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(false)}
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("schedule.deleteOccurrence")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(true)}
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("schedule.deleteSeries")}
                </Button>
              </>
            ) : (
              <Button
                variant="destructive"
                onClick={() => handleDelete(false)}
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("common.delete")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
