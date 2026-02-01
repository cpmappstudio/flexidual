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
import { SelectDropdown } from "@/components/ui/select-dropdown";
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

const formSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  lessonId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string(),
  duration: z.number().min(15).max(240), // 15 min to 4 hours
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
      lessonId: "none",
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

  // Reset form when dialog opens
  useEffect(() => {
    if (newEventDialogOpen) {
      const startDate = date || new Date();
      // If we are in month view, set time to next hour, if we are in day view, use the passed date (which likely has time)
      if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
        const nextHour = new Date();
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        
        // Keep the year/month/day from the selected calendar date
        startDate.setHours(nextHour.getHours());
        startDate.setMinutes(0);
      }

      setAnchorDate(startDate);

      form.reset({
        classId: form.getValues("classId") || "",
        lessonId: preselectedLessonId || "none",
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

  // Dropdown Options
  const start = form.watch("start");
  const prevDaysRef = useRef<number[]>([]);
  const selectedClassId = form.watch("classId");
  const isRecurring = form.watch("isRecurring");
  const recurrenceType = form.watch("recurrenceType");
  const daysOfWeek = form.watch("daysOfWeek") || [];
  const selectedLessonId = form.watch("lessonId");

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
  
  const currentClass = useMemo(() => 
    schedulableClasses?.find(c => c._id === selectedClassId), 
  [schedulableClasses, selectedClassId]);

  const usedLessonIds = useQuery(
    api.schedule.getUsedLessons,
    selectedClassId ? { classId: selectedClassId as Id<"classes"> } : "skip"
  );

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

  const lessonOptions = useMemo(() => {
    const opts = currentClass?.lessons.map(l => {
        const isUsed = usedLessonIds?.includes(l._id);
        return {
            value: l._id,
            label: isUsed ? `${l.order}. ${l.title} (Scheduled)` : `${l.order}. ${l.title}`,
            disabled: isUsed
        };
    }) || [];
    return [{ value: "none", label: t('schedule.noLesson'), disabled: false }, ...opts];
  }, [currentClass, t, usedLessonIds]);


  // Submit Handler
  async function onSubmit(values: FormValues) {
    // Validation: Title required if no lesson
    if ((!values.lessonId || values.lessonId === "none") && !values.title) {
        form.setError("title", { message: t('schedule.titleRequired') || "Title is required if no lesson selected" });
        return;
    }

    setIsSubmitting(true);
    try {
      const finalLessonId = values.lessonId === "none" ? undefined : values.lessonId as Id<"lessons">;
      const startMs = new Date(values.start).getTime();
      const endMs = startMs + (values.duration * 60 * 1000);

      if (values.isRecurring) {
        const finalDaysOfWeek = values.daysOfWeek && values.daysOfWeek.length > 0
          ? values.daysOfWeek
          : undefined;

        await createRecurring({
          classId: values.classId as Id<"classes">,
          lessonId: finalLessonId,
          title: values.title || undefined,
          description: values.description || undefined,
          scheduledStart: startMs,
          scheduledEnd: endMs,
          sessionType: values.sessionType as "live" | "ignitia",
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
          lessonId: finalLessonId,
          title: values.title || undefined,
          description: values.description || undefined,
          scheduledStart: startMs,
          scheduledEnd: endMs,
          sessionType: values.sessionType as "live" | "ignitia",
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

  // [UPDATED] Smart Start Date Logic
  useEffect(() => {
    if (!daysOfWeek || daysOfWeek.length === 0) return;
    
    // Check if days actually changed
    const daysChanged = JSON.stringify(daysOfWeek) !== JSON.stringify(prevDaysRef.current);
    if (!daysChanged) return;

    prevDaysRef.current = daysOfWeek;

    // Use anchorDate as the base, NOT the current form value
    // This ensures we always calculate relative to the user's original intent
    const smartStartDate = getSmartStartDate(anchorDate, daysOfWeek);

    // Only update if the result is different from what's currently shown
    const currentFormDate = new Date(form.getValues("start"));
    
    if (smartStartDate.getTime() !== currentFormDate.getTime()) {
      form.setValue("start", smartStartDate.toISOString());

      // [OPTIONAL] Toast notification
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('schedule.create')}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <FormField control={form.control} name="classId" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('class.name')}</FormLabel>
                <SelectDropdown 
                  options={classOptions} 
                  value={field.value} 
                  onValueChange={field.onChange} 
                  placeholder={t('class.selectClass') || "Select Class"}
                />
                <FormMessage />
              </FormItem>
            )} />

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="lessonId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('navigation.lessons')}</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={!selectedClassId}
                  >
                    <FormControl>
                      <SelectTrigger className="!w-full min-w-0">
                        <SelectValue placeholder={t('lesson.selectOptional')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {lessonOptions.map((opt) => (
                          <SelectItem 
                            key={opt.value} 
                            value={opt.value} 
                            disabled={opt.disabled}
                            className={opt.disabled ? "opacity-50" : ""}
                          >
                            <span className="truncate block max-w-full">{opt.label}</span>
                          </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('schedule.title')}</FormLabel>
                  <FormControl>
                    <Input 
                        {...field} 
                        placeholder={selectedLessonId !== "none" ? "Override lesson title" : "Required"} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('curriculum.description')}</FormLabel>
                <FormControl>
                    <Textarea {...field} placeholder="Add details..." className="resize-none h-20" />
                </FormControl>
              </FormItem>
            )} />

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
                      <SelectItem value="30">30 min</SelectItem>
                      <SelectItem value="45">45 min</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
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
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
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

                        {/* Day of Week Selector - Show for daily/weekly/biweekly */}
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
                                                className={`w-12 h-10 ${isStartDay ? "ring-2 ring-offset-2 ring-blue-500 dark:ring-blue-400" : ""}`}
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