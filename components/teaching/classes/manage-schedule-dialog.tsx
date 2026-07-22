"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BookOpen, Calendar, Edit, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { useAlert } from "@/components/providers/alert-provider";
import { cn } from "@/lib/utils";
import { utcToLocalDateTime } from "@/lib/time-zone";

interface ManageScheduleDialogProps {
  classId: Id<"classes">;
  scheduleId: Id<"classSchedule">;
  initialData: {
    lessonIds?: Id<"lessons">[];
    title?: string;
    description?: string;
    start: number;
    end: number;
    sessionType: "live" | "ignitia" | "abeka";
    isRecurring?: boolean;
    recurrenceParentId?: Id<"classSchedule">;
    timeZone: string;
  };
  trigger?: React.ReactNode;
}

type ScheduleMode = "curriculum" | "custom";

export function ManageScheduleDialog({
  classId,
  scheduleId,
  initialData,
  trigger,
}: ManageScheduleDialogProps) {
  const t = useTranslations();
  const { showAlert } = useAlert();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() =>
    initialData.lessonIds?.length ? "curriculum" : "custom",
  );
  const [lessonIds, setLessonIds] = useState<Id<"lessons">[]>(
    initialData.lessonIds || [],
  );
  const [title, setTitle] = useState(initialData.title || "");
  const [description, setDescription] = useState(initialData.description || "");
  const [sessionType, setSessionType] = useState(initialData.sessionType);
  const [startDate, setStartDate] = useState(() =>
    utcToLocalDateTime(initialData.start, initialData.timeZone),
  );
  const [duration, setDuration] = useState(() =>
    Math.round((initialData.end - initialData.start) / 1000 / 60),
  );
  const [updateSeries, setUpdateSeries] = useState(false);

  const classes = useQuery(api.classes.getSchedulableClasses);
  const selectedClass = classes?.find((c) => c._id === classId);
  const lessons = useQuery(
    api.lessons.listByCurriculum,
    selectedClass ? { curriculumId: selectedClass.curriculumId } : "skip",
  );
  const usedLessonIds = useQuery(api.schedule.getUsedLessons, { classId });
  const updateSchedule = useMutation(api.schedule.updateSchedule);
  const deleteSchedule = useMutation(api.schedule.deleteSchedule);
  const availableLessons =
    lessons?.filter(
      (lesson) =>
        !usedLessonIds?.includes(lesson._id) ||
        initialData.lessonIds?.includes(lesson._id),
    ) || [];

  useEffect(() => {
    if (!open) return;

    const hasLessons = Boolean(initialData.lessonIds?.length);
    setLessonIds(initialData.lessonIds || []);
    setScheduleMode(hasLessons ? "curriculum" : "custom");
    setTitle(initialData.title || "");
    setDescription(initialData.description || "");
    setSessionType(initialData.sessionType);
    setStartDate(
      utcToLocalDateTime(initialData.start, initialData.timeZone),
    );
    setDuration(Math.round((initialData.end - initialData.start) / 1000 / 60));
    setUpdateSeries(false);
  }, [open, initialData]);

  const handleSubmit = async () => {
    const isCurriculumSession = scheduleMode === "curriculum";
    const selectedLessonIds = isCurriculumSession ? lessonIds : [];

    if (isCurriculumSession && selectedLessonIds.length === 0) {
      toast.error(t("schedule.selectCurriculumLessonRequired"));
      return;
    }

    if (!isCurriculumSession && !title.trim()) {
      toast.error(t("schedule.titleRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      const finalLessonIds =
        selectedLessonIds.length > 0 ? selectedLessonIds : undefined;
      const finalTitle = isCurriculumSession ? "" : title.trim() || undefined;
      const finalDescription = isCurriculumSession
        ? ""
        : description.trim() || undefined;

      await updateSchedule({
        id: scheduleId,
        lessonIds: finalLessonIds,
        title: finalTitle,
        description: finalDescription,
        localStart: startDate,
        durationMinutes: duration,
        sessionType,
        updateSeries,
      });
      toast.success(t("schedule.scheduleUpdated"));
      setOpen(false);
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
  };

  const handleDelete = () => {
    showAlert({
      title: t("common.delete"),
      description: t("schedule.deleteConfirm"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await deleteSchedule({ id: scheduleId });
          toast.success(t("schedule.deleted"));
          setOpen(false);
        } catch {
          toast.error(t("schedule.deleteFailed"));
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  };

  const toggleLesson = (id: Id<"lessons">) => {
    setLessonIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  const changeScheduleMode = (mode: ScheduleMode) => {
    setScheduleMode(mode);
    if (mode === "custom") setLessonIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="shrink-0 border-b px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              {t("schedule.edit")}
            </DialogTitle>
            <DialogDescription>
              {t("schedule.editDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            {(initialData.isRecurring || initialData.recurrenceParentId) && (
              <div className="p-4 border-2 rounded-lg bg-info/10 border-info/30 space-y-3">
                <Label className="text-base font-semibold text-info">
                  {t("schedule.updateScope")}
                </Label>

                <RadioGroup
                  value={updateSeries ? "series" : "instance"}
                  onValueChange={(v) => {
                    const willUpdateSeries = v === "series";
                    setUpdateSeries(willUpdateSeries);

                    if (willUpdateSeries) {
                      setLessonIds([]);
                      setScheduleMode("custom");
                    }
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-start space-x-3 p-3 rounded-md border border-info/30 bg-card cursor-pointer hover:bg-info/10 transition-colors">
                    <RadioGroupItem
                      value="instance"
                      id="scope-instance"
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor="scope-instance"
                        className="font-medium cursor-pointer"
                      >
                        {t("schedule.thisEventOnly")}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("schedule.instanceNote")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 rounded-md border border-info/30 bg-card cursor-pointer hover:bg-info/10 transition-colors">
                    <RadioGroupItem
                      value="series"
                      id="scope-series"
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor="scope-series"
                        className="font-medium cursor-pointer"
                      >
                        {t("schedule.allFutureEvents")}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("schedule.seriesUpdateNote")}
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {!updateSeries && (
              <div className="space-y-3">
                <Label>{t("schedule.whatAreYouScheduling")}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => changeScheduleMode("curriculum")}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
                      scheduleMode === "curriculum" &&
                        "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <BookOpen className="h-4 w-4 text-primary" />
                      {t("schedule.curriculumLesson")}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("schedule.curriculumLessonDescription")}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => changeScheduleMode("custom")}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
                      scheduleMode === "custom" &&
                        "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <Calendar className="h-4 w-4 text-primary" />
                      {t("schedule.customSession")}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("schedule.customSessionDescription")}
                    </p>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>{t("schedule.sessionFormat")}</Label>
              <RadioGroup
                value={sessionType}
                onValueChange={(v) =>
                  setSessionType(v as "live" | "ignitia" | "abeka")
                }
                className="grid gap-3 sm:grid-cols-3"
              >
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="live" id="st-live" className="mt-1" />
                  <div className="space-y-1">
                    <Label
                      htmlFor="st-live"
                      className="cursor-pointer font-medium"
                    >
                      {t("schedule.typeLive")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("schedule.typeLiveDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem
                    value="ignitia"
                    id="st-ignitia"
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="st-ignitia"
                      className="cursor-pointer font-medium"
                    >
                      {t("schedule.typeIgnitia")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("schedule.typeIgnitiaDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem
                    value="abeka"
                    id="st-abeka"
                    className="mt-1"
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="st-abeka"
                      className="cursor-pointer font-medium"
                    >
                      {t("schedule.typeAbeka")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t("schedule.typeAbekaDescription")}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {scheduleMode === "curriculum" && !updateSeries && (
              <div className="space-y-2">
                <Label>
                  {t("schedule.linkCurriculumLessons")}
                  {lessonIds.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("schedule.selectedLessons", {
                        count: lessonIds.length,
                      })}
                    </span>
                  )}
                </Label>

                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {!lessons ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t("schedule.loadingLessons")}
                    </div>
                  ) : availableLessons.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t("schedule.allLessonsScheduled")}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {availableLessons.map((lesson) => {
                        const isSelected = lessonIds.includes(lesson._id);

                        return (
                          <button
                            key={lesson._id}
                            type="button"
                            onClick={() => toggleLesson(lesson._id)}
                            className={`w-full cursor-pointer overflow-hidden px-4 py-3 text-left transition-colors hover:bg-accent ${isSelected ? "border-l-4 border-primary bg-primary/10" : ""}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div
                                  className={`flex shrink-0 h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                                    isSelected
                                      ? "bg-primary border-primary"
                                      : "border-input"
                                  }`}
                                >
                                  {isSelected && (
                                    <svg
                                      className="h-3 w-3 text-primary-foreground"
                                      viewBox="0 0 12 12"
                                      fill="none"
                                    >
                                      <path
                                        d="M10 3L4.5 8.5L2 6"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">
                                    {lesson.order}. {lesson.title}
                                  </div>
                                  {lesson.description && (
                                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                                      {lesson.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {scheduleMode === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>
                    {t("schedule.title")}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("schedule.enterTitle")}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t("schedule.description")}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder={t("schedule.descriptionPlaceholder")}
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("schedule.dateTime")}</Label>
                <DateTimePicker
                  field={{
                    value: startDate,
                    onChange: setStartDate,
                  }}
                  timeZone={initialData.timeZone}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("schedule.duration")}</Label>
                <Select
                  value={duration.toString()}
                  onValueChange={(v) => setDuration(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">
                      30 {t("schedule.minutes")}
                    </SelectItem>
                    <SelectItem value="45">
                      45 {t("schedule.minutes")}
                    </SelectItem>
                    <SelectItem value="60">1 {t("schedule.hour")}</SelectItem>
                    <SelectItem value="90">
                      1.5 {t("schedule.hours")}
                    </SelectItem>
                    <SelectItem value="120">2 {t("schedule.hours")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            <Button
              variant="destructive"
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="mr-auto"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
