"use client";

import { useState, useEffect, useRef } from "react";
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
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Calendar,
  Plus,
  Edit,
  Loader2,
  Trash2,
  CalendarClock,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
import { RecurrenceType } from "@/lib/types/schedule";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { getSmartStartDate } from "@/lib/date-utils";
import { useAlert } from "@/components/providers/alert-provider";
import { cn } from "@/lib/utils";

interface ManageScheduleDialogProps {
  classId: Id<"classes">;
  trigger?: React.ReactNode;

  // Create Mode Options
  preselectedLessonId?: Id<"lessons">;
  preselectedDate?: Date;

  // Edit Mode Options (if scheduleId is present, we are in Edit Mode)
  scheduleId?: Id<"classSchedule">;
  initialData?: {
    lessonIds?: Id<"lessons">[];
    title?: string;
    description?: string;
    start: number;
    end: number;
    sessionType: "live" | "ignitia" | "abeka";
    isRecurring?: boolean;
    recurrenceParentId?: Id<"classSchedule">;
  };
}

type ScheduleMode = "curriculum" | "custom";

function getInitialScheduleMode(
  initialData?: ManageScheduleDialogProps["initialData"],
  preselectedLessonId?: Id<"lessons">,
): ScheduleMode | null {
  if (initialData) {
    return initialData.lessonIds?.length ? "curriculum" : "custom";
  }

  return preselectedLessonId ? "curriculum" : null;
}

export function ManageScheduleDialog({
  classId,
  trigger,
  preselectedLessonId,
  preselectedDate,
  scheduleId,
  initialData,
}: ManageScheduleDialogProps) {
  const t = useTranslations();
  const { showAlert } = useAlert();
  const locale = useLocale();
  const isEditing = !!scheduleId;
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode | null>(() =>
    getInitialScheduleMode(initialData, preselectedLessonId),
  );

  // Changed to array for multiple lessons
  const [lessonIds, setLessonIds] = useState<Id<"lessons">[]>(() => {
    if (initialData?.lessonIds && initialData.lessonIds.length > 0) {
      return initialData.lessonIds;
    }
    if (preselectedLessonId) {
      return [preselectedLessonId];
    }
    return [];
  });

  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [sessionType, setSessionType] = useState<"live" | "ignitia" | "abeka">(
    initialData?.sessionType || "live",
  );

  // Date State
  const [startDate, setStartDate] = useState<string>(() => {
    if (initialData?.start) return new Date(initialData.start).toISOString();

    const date = preselectedDate || new Date();
    if (!preselectedDate) {
      date.setMinutes(0, 0, 0);
      date.setHours(date.getHours() + 1);
    }
    return date.toISOString();
  });

  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date(startDate));

  const [duration, setDuration] = useState(() => {
    if (initialData?.start && initialData?.end) {
      return Math.round((initialData.end - initialData.start) / 1000 / 60);
    }
    return 60;
  });

  // Recurrence State
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<
    "daily" | "weekly" | "biweekly" | "monthly"
  >("weekly");
  const [occurrences, setOccurrences] = useState(10);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const prevDaysRef = useRef<number[]>([]);
  const [updateSeries, setUpdateSeries] = useState(false);

  // --- Data & Mutations ---
  const classes = useQuery(api.classes.getSchedulableClasses);
  const selectedClass = classes?.find((c) => c._id === classId);
  const lessons = useQuery(
    api.lessons.listByCurriculum,
    selectedClass ? { curriculumId: selectedClass.curriculumId } : "skip",
  );
  const usedLessonIds = useQuery(api.schedule.getUsedLessons, { classId });
  const createSchedule = useMutation(api.schedule.createSchedule);
  const createRecurring = useMutation(api.schedule.createRecurringSchedule);
  const updateSchedule = useMutation(api.schedule.updateSchedule);
  const deleteSchedule = useMutation(api.schedule.deleteSchedule);
  const availableLessons =
    lessons?.filter(
      (lesson) =>
        !usedLessonIds?.includes(lesson._id) ||
        initialData?.lessonIds?.includes(lesson._id),
    ) || [];

  // Reset form when opening
  useEffect(() => {
    if (open) {
      // ✅ Updated: Handle both formats
      if (initialData?.lessonIds && initialData.lessonIds.length > 0) {
        setLessonIds(initialData.lessonIds);
        setScheduleMode("curriculum");
      } else if (initialData) {
        setLessonIds([]);
        setScheduleMode("custom");
      } else if (preselectedLessonId) {
        setLessonIds([preselectedLessonId]);
        setScheduleMode("curriculum");
      } else {
        setLessonIds([]);
        setScheduleMode(null);
      }

      setTitle(initialData?.title || "");
      setDescription(initialData?.description || "");
      setSessionType(initialData?.sessionType || "live");

      let initialStartStr = "";
      if (initialData?.start) {
        initialStartStr = new Date(initialData.start).toISOString();
        setDuration(
          Math.round((initialData.end - initialData.start) / 1000 / 60),
        );
      } else {
        const date = preselectedDate || new Date();
        if (!preselectedDate) {
          date.setMinutes(0, 0, 0);
          date.setHours(date.getHours() + 1);
        }
        initialStartStr = date.toISOString();
        setDuration(60);
      }

      setStartDate(initialStartStr);
      setAnchorDate(new Date(initialStartStr));
      setIsRecurring(initialData?.isRecurring || false);
      setDaysOfWeek([]);
      prevDaysRef.current = [];
      setUpdateSeries(false);
    }
  }, [open, initialData, preselectedLessonId, preselectedDate]);

  useEffect(() => {
    if (!daysOfWeek || daysOfWeek.length === 0) return;

    // Check if days actually changed
    const daysChanged =
      JSON.stringify(daysOfWeek) !== JSON.stringify(prevDaysRef.current);
    if (!daysChanged) return;

    prevDaysRef.current = daysOfWeek;

    // Use anchorDate as the base
    const smartStartDate = getSmartStartDate(anchorDate, daysOfWeek);
    const currentFormDate = new Date(startDate);

    if (smartStartDate.getTime() !== currentFormDate.getTime()) {
      setStartDate(smartStartDate.toISOString());

      toast.info(t("schedule.dateAdjusted"), {
        description:
          t("schedule.dateAdjustedDesc", {
            date: smartStartDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            }),
          }) ||
          `Moved to ${smartStartDate.toLocaleDateString()} to match pattern.`,
        duration: 3000,
        icon: <CalendarClock className="h-4 w-4 text-info" />,
      });
    }
  }, [daysOfWeek, anchorDate, startDate, t]);

  useEffect(() => {
    if (open && isEditing && initialData?.isRecurring) {
      setLessonIds([]);
      setIsRecurring(true);
      setScheduleMode("custom");
    }
  }, [open, isEditing, initialData]);

  const handleSubmit = async () => {
    if (!scheduleMode) {
      toast.error(t("schedule.selectScheduleModeRequired"));
      return;
    }

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

    // Block recurring with lessons
    if (isRecurring && selectedLessonIds.length > 0) {
      toast.error(t("schedule.recurringNoLessons"));
      return;
    }

    setIsSubmitting(true);

    try {
      const start = new Date(startDate).getTime();
      const end = start + duration * 60 * 1000;
      const finalLessonIds =
        selectedLessonIds.length > 0 ? selectedLessonIds : undefined;
      const finalTitle = isCurriculumSession ? "" : title.trim() || undefined;
      const finalDescription = isCurriculumSession
        ? ""
        : description.trim() || undefined;
      const timezoneOffset = new Date().getTimezoneOffset();

      if (isEditing && scheduleId) {
        await updateSchedule({
          id: scheduleId,
          lessonIds: finalLessonIds,
          title: finalTitle,
          description: finalDescription,
          scheduledStart: start,
          scheduledEnd: end,
          sessionType,
          updateSeries,
        });
        toast.success(t("schedule.scheduleUpdated"));
      } else {
        if (isRecurring) {
          const finalDaysOfWeek =
            daysOfWeek.length > 0 ? daysOfWeek : undefined;
          await createRecurring({
            classId,
            lessonIds: undefined, // Always undefined for recurring
            sessionType,
            title: finalTitle || undefined,
            description: finalDescription,
            scheduledStart: start,
            scheduledEnd: end,
            timezoneOffset: timezoneOffset,
            recurrence: {
              type: recurrenceType,
              daysOfWeek: finalDaysOfWeek,
              occurrences,
            },
          });
          toast.success(t("schedule.recurringCreated"));
        } else {
          await createSchedule({
            classId,
            lessonIds: finalLessonIds,
            sessionType,
            title: finalTitle,
            description: finalDescription,
            scheduledStart: start,
            scheduledEnd: end,
          });
          toast.success(t("schedule.created"));
        }
      }

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

  const handleDelete = async () => {
    if (!scheduleId) return;

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

  // Helper to toggle lesson selection
  const toggleLesson = (id: Id<"lessons">) => {
    setLessonIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  const changeScheduleMode = (mode: ScheduleMode) => {
    setScheduleMode(mode);

    if (mode === "custom") {
      setLessonIds([]);
      return;
    }

    setIsRecurring(false);
    if (preselectedLessonId && lessonIds.length === 0) {
      setLessonIds([preselectedLessonId]);
    }
  };

  const weekDays = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
  ];

  const currentStartDayIndex = new Date(startDate).getDay();
  const hasSelectedScheduleMode = scheduleMode !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ||
          (isEditing ? (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Edit className="h-4 w-4 text-muted-foreground" />
            </Button>
          ) : (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("schedule.create")}
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="shrink-0 border-b px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle className="flex items-center gap-2">
              {isEditing ? (
                <Edit className="h-5 w-5" />
              ) : (
                <Calendar className="h-5 w-5" />
              )}
              {isEditing ? t("schedule.edit") : t("schedule.createNew")}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? t("schedule.editDescription")
                : t("schedule.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            {isEditing &&
              (initialData?.isRecurring || initialData?.recurrenceParentId) && (
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

            {hasSelectedScheduleMode && (
              <>
                {/* Session Type */}
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
                      <RadioGroupItem
                        value="live"
                        id="st-live"
                        className="mt-1"
                      />
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

                    {isEditing && updateSeries && (
                      <div className="bg-warning/10 border-2 border-warning/40 rounded-md p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-sm text-warning">
                              {t("schedule.seriesLessonsBlocked")}
                            </p>
                            <p className="text-xs text-warning mt-1">
                              {t("schedule.switchToInstance")}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

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
                            const isDisabled = isEditing && updateSeries;

                            return (
                              <button
                                key={lesson._id}
                                type="button"
                                onClick={() =>
                                  !isDisabled && toggleLesson(lesson._id)
                                }
                                disabled={isDisabled}
                                className={`w-full text-left px-4 py-3 transition-colors overflow-hidden ${
                                  isDisabled
                                    ? "opacity-40 cursor-not-allowed bg-muted/50"
                                    : "hover:bg-accent cursor-pointer"
                                } ${isSelected ? "bg-primary/10 border-l-4 border-primary" : ""}`}
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

                    {(!isEditing || isRecurring) && (
                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <Label>{t("schedule.recurring")}</Label>
                          <p className="text-sm text-muted-foreground">
                            {t("schedule.recurringDescription")}
                          </p>
                        </div>
                        <Switch
                          checked={isRecurring}
                          onCheckedChange={setIsRecurring}
                          disabled={isEditing}
                        />
                      </div>
                    )}

                    {isRecurring && !isEditing && (
                      <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{t("schedule.repeat")}</Label>
                            <Select
                              value={recurrenceType}
                              onValueChange={(v) =>
                                setRecurrenceType(v as RecurrenceType)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="daily">
                                  {t("schedule.recurrence.daily")}
                                </SelectItem>
                                <SelectItem value="weekly">
                                  {t("schedule.recurrence.weekly")}
                                </SelectItem>
                                <SelectItem value="biweekly">
                                  {t("schedule.recurrence.biweekly")}
                                </SelectItem>
                                <SelectItem value="monthly">
                                  {t("schedule.recurrence.monthly")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("schedule.occurrences")}</Label>
                            <Input
                              type="number"
                              min={1}
                              max={52}
                              value={occurrences}
                              onChange={(e) =>
                                setOccurrences(Number(e.target.value))
                              }
                            />
                          </div>
                        </div>

                        {recurrenceType !== "monthly" && (
                          <div className="space-y-2">
                            <Label>{t("schedule.repeatOn")}</Label>
                            <div className="flex flex-wrap gap-2">
                              {weekDays.map((day) => {
                                const isStartDay =
                                  day.value === currentStartDayIndex;
                                const toggleDayOfWeek = (dayVal: number) => {
                                  setDaysOfWeek((prev) =>
                                    prev.includes(dayVal)
                                      ? prev.filter((d) => d !== dayVal)
                                      : [...prev, dayVal].sort(),
                                  );
                                };

                                return (
                                  <Button
                                    key={day.value}
                                    type="button"
                                    variant={
                                      daysOfWeek.includes(day.value)
                                        ? "default"
                                        : "outline"
                                    }
                                    size="sm"
                                    onClick={() => toggleDayOfWeek(day.value)}
                                    className={`w-12 ${isStartDay ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                                    title={
                                      isStartDay
                                        ? t("schedule.currentStartDate")
                                        : undefined
                                    }
                                  >
                                    {day.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("schedule.dateTime")}</Label>
                    <DateTimePicker
                      field={{
                        value: startDate,
                        onChange: (val) => {
                          setStartDate(val);
                          setAnchorDate(new Date(val));
                        },
                      }}
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
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            {isEditing && (
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
            )}
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            {hasSelectedScheduleMode && (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing
                  ? t("common.saveChanges")
                  : t("schedule.createSessionAction")}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
