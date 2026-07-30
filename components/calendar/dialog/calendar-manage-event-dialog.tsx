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
  CalendarClock,
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
import { useParams } from "next/navigation";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { utcToLocalDateTime } from "@/lib/time-zone";
import { getCalendarEventDisplay } from "../calendar-event-display";
import { CalendarProviderMark } from "../calendar-provider-mark";
import { getCalendarProviderAppearanceClasses } from "../calendar-tailwind-classes";
import { useCurrentMinute } from "@/hooks/use-current-minute";
import { useIsMobile } from "@/hooks/use-mobile";
import { getCalendarEventPrimaryAction } from "@/lib/calendar-event-action";

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

  const lastEventIdRef = useRef<string | null>(null);

  const params = useParams();
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
  const providerAppearance = getCalendarProviderAppearanceClasses(
    selectedEvent.sessionType,
  );
  const providerLabel =
    selectedEvent.sessionType === "ignitia"
      ? t("schedule.typeIgnitia")
      : selectedEvent.sessionType === "abeka"
        ? t("schedule.typeAbeka")
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

  return (
    <>
      <Dialog
        open={manageEventDialogOpen && !(isMobile && recordingOpen)}
        onOpenChange={handleClose}
      >
        <DialogContent
          className="max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden"
          showCloseButton={false}
        >
          <DialogHeader className="flex flex-row items-start justify-between space-y-0">
            <DialogTitle>
              {isEditing ? t("common.edit") : t("schedule.viewDetails")}
            </DialogTitle>

            {!readOnly && selectedEvent.status !== "cancelled" && (
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
            <div className="space-y-6 w-full min-w-0">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold">
                    {primaryLabel}
                    {gradeLabel && ` (${gradeLabel})`}
                  </h2>
                  {(secondaryText || providerLabel) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {secondaryText && (
                        <p className="text-sm text-muted-foreground">
                          {secondaryText}
                        </p>
                      )}
                      {providerLabel && providerAppearance && (
                        <Badge
                          variant="outline"
                          className={`h-7 gap-1.5 px-2.5 font-semibold ${providerAppearance.badge}`}
                        >
                          <CalendarProviderMark
                            sessionType={selectedEvent.sessionType}
                            className="size-4"
                          />
                          {providerLabel}
                        </Badge>
                      )}
                    </div>
                  )}
                  {selectedEvent.isLive && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="destructive" className="animate-pulse">
                        <span className="relative flex h-2 w-2 mr-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive-foreground opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive-foreground"></span>
                        </span>
                        {t("common.live")}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 text-sm">
                {/* Date & Time */}
                <div className="flex gap-3">
                  <CalendarClock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{displayDate}</p>
                    <p className="text-muted-foreground">
                      {displayStartTime} - {displayEndTime}
                      {!isStudent && (
                        <span className="text-xs ml-2">
                          ({duration} {t("schedule.minutes")})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleClose}>
                  {t("common.close")}
                </Button>
                {canWatchRecording ? (
                  <Button
                    className="gap-2"
                    onClick={() => setRecordingOpen(true)}
                  >
                    <PlayCircle className="h-4 w-4" />
                    {t("recordings.watchRecording")}
                  </Button>
                ) : primaryAction === "go-to-classroom" ? (
                  <Button asChild>
                    <Link
                      href={`/${orgSlug}/classroom/${selectedEvent.roomName}`}
                    >
                      {t("dashboard.goToClassroom")}
                      <MoveRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : primaryAction === "enter-live" ? (
                  <Button
                    className="bg-success text-success-foreground hover:bg-success/90"
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
                  <Button asChild>
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
