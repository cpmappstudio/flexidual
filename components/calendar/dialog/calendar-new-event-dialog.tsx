"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCalendarContext } from "../calendar-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";
import { Loader2, CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";
import { getSmartStartDate } from "@/lib/date-utils";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  lessonIds: z.array(z.string()).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string(),
  duration: z.number().min(15).max(240),
  sessionType: z.enum(["live", "ignitia"]),
  isRecurring: z.boolean(),
  recurrenceType: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  occurrences: z.number().min(1).max(52),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CalendarNewEventDialog() {
  const t = useTranslations();
  const locale = useLocale();
  const { 
    newEventDialogOpen, 
    setNewEventDialogOpen, 
    date, 
    userId,
    preselectedLessonId,
    setPreselectedLessonId,
    selectedTeacherId,
  } = useCalendarContext();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const prevDaysRef = useRef<number[]>([]);

  // Queries
  const schedulableClasses = useQuery(
    api.classes.getSchedulableClasses,
    userId ? {} : "skip"
  );
  
  // Mutations
  const createSchedule = useMutation(api.schedule.createSchedule);
  const createRecurring = useMutation(api.schedule.createRecurringSchedule);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      classId: "",
      lessonIds: [],
      title: "",
      description: "",
      start: new Date().toISOString(),
      duration: 60,
      sessionType: "live",
      isRecurring: false,
      recurrenceType: "weekly",
      occurrences: 10,
      daysOfWeek: [],
    },
  });

  // Watch values
  const selectedClassId = form.watch("classId");
  const isRecurring = form.watch("isRecurring");
  const recurrenceType = form.watch("recurrenceType");
  const daysOfWeek = form.watch("daysOfWeek") || [];
  const lessonIds = form.watch("lessonIds") || [];
  const start = form.watch("start");

  // ✅ Fetch full lesson details
  const selectedClass = useMemo(() => 
    schedulableClasses?.find(c => c._id === selectedClassId), 
    [schedulableClasses, selectedClassId]
  );

  const lessons = useQuery(
    api.lessons.listByCurriculum,
    selectedClass ? { curriculumId: selectedClass.curriculumId } : "skip"
  );

  const usedLessonIds = useQuery(
    api.schedule.getUsedLessons,
    selectedClassId ? { classId: selectedClassId as Id<"classes"> } : "skip"
  );

  // Reset form when dialog opens
  useEffect(() => {
    if (newEventDialogOpen) {
      const startDate = date || new Date();
      if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
        const nextHour = new Date();
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        startDate.setHours(nextHour.getHours());
        startDate.setMinutes(0);
      }

      setAnchorDate(startDate);

      form.reset({
        classId: form.getValues("classId") || "",
        lessonIds: preselectedLessonId ? [preselectedLessonId] : [],
        title: "",
        description: "",
        start: startDate.toISOString(),
        duration: 60,
        sessionType: "live",
        isRecurring: false,
        recurrenceType: "weekly",
        occurrences: 10,
        daysOfWeek: [],
      });
    }
  }, [newEventDialogOpen, date, form, preselectedLessonId]);

  // ✅ Helper to toggle lesson selection
  const toggleLesson = (id: string) => {
    const current = form.getValues("lessonIds") || [];
    const updated = current.includes(id)
      ? current.filter(l => l !== id)
      : [...current, id];
    form.setValue("lessonIds", updated);
  };

  const toggleDayOfWeek = (day: number) => {
    const current = form.getValues("daysOfWeek") || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort();
    form.setValue("daysOfWeek", updated);
  };

  const weekDays = [
    { value: 0, label: "Sun", key: "days.sunday" },
    { value: 1, label: "Mon", key: "days.monday" },
    { value: 2, label: "Tue", key: "days.tuesday" },
    { value: 3, label: "Wed", key: "days.wednesday" },
    { value: 4, label: "Thu", key: "days.thursday" },
    { value: 5, label: "Fri", key: "days.friday" },
    { value: 6, label: "Sat", key: "days.saturday" },
  ];

  const classOptions = useMemo(() => {
    if (!schedulableClasses) return [];
    
    let classes = schedulableClasses;
    if (selectedTeacherId) {
      classes = classes.filter(c => c.teacherId === selectedTeacherId);
    }
    
    return classes.map(c => ({
      value: c._id,
      label: `${c.name} (${c.curriculumTitle})`
    }));
  }, [schedulableClasses, selectedTeacherId]);

  // Submit Handler
  async function onSubmit(values: FormValues) {
    // ✅ Validation: Title required if no lessons
    if ((!values.lessonIds || values.lessonIds.length === 0) && !values.title?.trim()) {
      form.setError("title", { 
        message: t('schedule.titleRequired') || "Title is required if no lesson selected" 
      });
      return;
    }

    // ✅ Block recurring with lessons
    if (values.isRecurring && values.lessonIds && values.lessonIds.length > 0) {
      toast.error(
        t("schedule.recurringNoLessons") || 
        "Cannot create recurring schedules with lessons. Create individual schedules instead."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const finalLessonIds = values.lessonIds && values.lessonIds.length > 0 
        ? values.lessonIds.map(id => id as Id<"lessons">) 
        : undefined;
      const startMs = new Date(values.start).getTime();
      const endMs = startMs + (values.duration * 60 * 1000);

      if (values.isRecurring) {
        const finalDaysOfWeek = values.daysOfWeek && values.daysOfWeek.length > 0
          ? values.daysOfWeek
          : undefined;

        const timezoneOffset = new Date().getTimezoneOffset();

        await createRecurring({
          classId: values.classId as Id<"classes">,
          lessonIds: undefined, // ✅ Always undefined for recurring
          sessionType: values.sessionType as "live" | "ignitia",
          title: values.title || undefined,
          description: values.description || undefined,
          scheduledStart: startMs,
          scheduledEnd: endMs,
          timezoneOffset: timezoneOffset,
          recurrence: {
            type: values.recurrenceType,
            occurrences: values.occurrences,
            daysOfWeek: finalDaysOfWeek,
          }
        });
        toast.success(t('schedule.recurringCreated') || "Series created");
      } else {
        await createSchedule({
          classId: values.classId as Id<"classes">,
          lessonIds: finalLessonIds,
          sessionType: values.sessionType as "live" | "ignitia",
          title: values.title || undefined,
          description: values.description || undefined,
          scheduledStart: startMs,
          scheduledEnd: endMs,
        });
        toast.success(t('schedule.created') || "Event created");
      }

      setNewEventDialogOpen(false);
      setPreselectedLessonId(null);
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

  // Smart Start Date Logic
  useEffect(() => {
    if (!daysOfWeek || daysOfWeek.length === 0) return;
    
    const daysChanged = JSON.stringify(daysOfWeek) !== JSON.stringify(prevDaysRef.current);
    if (!daysChanged) return;

    prevDaysRef.current = daysOfWeek;

    const smartStartDate = getSmartStartDate(anchorDate, daysOfWeek);
    const currentFormDate = new Date(form.getValues("start"));
    
    if (smartStartDate.getTime() !== currentFormDate.getTime()) {
      form.setValue("start", smartStartDate.toISOString());

      toast.info(t('schedule.dateAdjusted') || "Start Date Adjusted", {
        description: t('schedule.dateAdjustedDesc', { 
          date: smartStartDate.toLocaleDateString(undefined, { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
          }) 
        }),
        duration: 3000,
        icon: <CalendarClock className="h-4 w-4 text-blue-500" />
      });
    }
  }, [daysOfWeek, anchorDate, form, t]);

  return (
    <Dialog open={newEventDialogOpen} onOpenChange={setNewEventDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('schedule.create')}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            {/* Class Selection */}
            <FormField control={form.control} name="classId" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('class.name')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('class.selectClass') || "Select Class"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {classOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Session Type */}
            <FormField control={form.control} name="sessionType" render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>{t('schedule.sessionType')}</FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="flex flex-row space-x-4"
                  >
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="live" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        {t('schedule.typeLive')}
                      </FormLabel>
                    </FormItem>
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <RadioGroupItem value="ignitia" />
                      </FormControl>
                      <FormLabel className="font-normal cursor-pointer">
                        {t('schedule.typeIgnitia')}
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ✅ Multi-Select Lesson UI */}
            <div className="space-y-2">
              <Label>
                {t("lesson.selectOptional") || "Lessons (Optional)"}
                {lessonIds.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({lessonIds.length} selected)
                  </span>
                )}
              </Label>
              
              {/* ✅ Warning for recurring + lessons */}
              {isRecurring && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium">
                    ⚠️ {t('schedule.recurringNoLessonsTitle') || "Recurring schedules cannot have lessons"}
                  </p>
                  <p className="text-xs mt-1">
                    {t('schedule.recurringNoLessonsDesc') || "Create individual schedules to assign specific lessons."}
                  </p>
                </div>
              )}

              <div className="border rounded-md max-h-48 overflow-y-auto">
                {!lessons || lessons.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {t("lesson.noneAvailable") || "No lessons available for this class"}
                  </div>
                ) : (
                  <div className="divide-y">
                    {lessons.map((lesson) => {
                      const isUsed = usedLessonIds?.includes(lesson._id);
                      const isSelected = lessonIds.includes(lesson._id);
                      const isDisabled = isRecurring || isUsed;

                      return (
                        <button
                          key={lesson._id}
                          type="button"
                          onClick={() => !isDisabled && toggleLesson(lesson._id)}
                          disabled={isDisabled}
                          className={`w-full text-left px-4 py-3 transition-colors ${
                            isDisabled 
                              ? "opacity-40 cursor-not-allowed bg-muted/50" 
                              : "hover:bg-accent cursor-pointer"
                          } ${isSelected ? "bg-primary/10 border-l-4 border-primary" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                                isSelected 
                                  ? "bg-primary border-primary" 
                                  : "border-input"
                              }`}>
                                {isSelected && (
                                  <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                    <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
                            {isUsed && (
                              <span className="text-xs bg-muted px-2 py-1 rounded">
                                {t("lesson.scheduled") || "Scheduled"}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('schedule.title') || "Title"}
                  {lessonIds.length === 0 && <span className="text-destructive ml-1">*</span>}
                </FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder={
                      lessonIds.length > 0 
                        ? t('schedule.overrideTitle')
                        : t('schedule.enterTitle')
                    } 
                  />
                </FormControl>
                {lessonIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("schedule.titleOverrideHint") || "Leave empty to use first lesson's title"}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )} />

            {/* Description */}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('common.description')}</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder={t('schedule.descriptionPlaceholder')} className="resize-none h-20" />
                </FormControl>
              </FormItem>
            )} />

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="start" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('schedule.dateTime') || "Start Time"}</FormLabel>
                  <DateTimePicker 
                    field={{
                      ...field,
                      onChange: (isoDateString: string) => {
                        setAnchorDate(new Date(isoDateString));
                        field.onChange(isoDateString);
                      }
                    }} 
                  />
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="duration" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('schedule.duration') || "Duration"}</FormLabel>
                  <Select value={field.value.toString()} onValueChange={(v) => field.onChange(Number(v))}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="30">30 {t('schedule.minutes')}</SelectItem>
                      <SelectItem value="45">45 {t('schedule.minutes')}</SelectItem>
                      <SelectItem value="60">1 {t('schedule.hour')}</SelectItem>
                      <SelectItem value="90">1.5 {t('schedule.hours')}</SelectItem>
                      <SelectItem value="120">2 {t('schedule.hours')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Recurrence Section */}
            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/20">
              <FormField control={form.control} name="isRecurring" render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel>{t('schedule.recurring')}</FormLabel>
                  </div>
                  <FormControl>
                    <Switch 
                      checked={field.value} 
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        // ✅ Clear lessons when enabling recurring
                        if (checked) {
                          form.setValue("lessonIds", []);
                        }
                      }} 
                    />
                  </FormControl>
                </FormItem>
              )} />

              {isRecurring && (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="recurrenceType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('schedule.repeat')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="daily">{t('schedule.recurrence.daily')}</SelectItem>
                            <SelectItem value="weekly">{t('schedule.recurrence.weekly')}</SelectItem>
                            <SelectItem value="biweekly">{t('schedule.recurrence.biweekly')}</SelectItem>
                            <SelectItem value="monthly">{t('schedule.recurrence.monthly')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    
                    <FormField control={form.control} name="occurrences" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('schedule.occurrences')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value))} 
                            min={2} 
                            max={52} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {(recurrenceType === "daily" || recurrenceType === "weekly" || recurrenceType === "biweekly") && (
                    <FormField control={form.control} name="daysOfWeek" render={() => {
                      const startDayIndex = new Date(start).getDay();
                      return (
                        <FormItem>
                          <FormLabel>
                            {recurrenceType === "daily" 
                              ? t('schedule.repeatOnDays') || "Repeat on days (optional)"
                              : t('schedule.daysOfWeek') || "Repeat on"
                            }
                          </FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {weekDays.map((day) => {
                              const isStartDay = day.value === startDayIndex;

                              return (
                                <Button
                                  key={day.value}
                                  type="button"
                                  variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => toggleDayOfWeek(day.value)}
                                  className={`w-12 h-10 ${isStartDay ? "ring-2 ring-ring" : ""}`}
                                  title={isStartDay ? "Current Start Date" : undefined}
                                >
                                  {t(day.key) || day.label}
                                </Button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {recurrenceType === "daily"
                              ? t('schedule.dailyDaysHelp') || "Leave empty to repeat every day"
                              : t('schedule.daysHelp') || "Leave empty to repeat on the same day of week"
                            }
                          </p>
                          <FormMessage />
                        </FormItem>
                      );
                    }} />
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNewEventDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.create')}
              </Button>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}