"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

const formSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  lessonId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string(),
  end: z.string(),
  isRecurring: z.boolean(),
  recurrenceType: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  occurrences: z.number().min(1).max(52),
});

type FormValues = z.infer<typeof formSchema>;

export default function CalendarNewEventDialog() {
  const t = useTranslations();
  const { 
    newEventDialogOpen, 
    setNewEventDialogOpen, 
    date, 
    userId,
    preselectedLessonId,
    setPreselectedLessonId 
  } = useCalendarContext();
  
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      end: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(),
      isRecurring: false,
      recurrenceType: "weekly",
      occurrences: 10,
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

      form.reset({
        classId: form.getValues("classId") || "",
        lessonId: preselectedLessonId || "none",
        title: "",
        description: "",
        start: startDate.toISOString(),
        end: new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(),
        isRecurring: false,
        recurrenceType: "weekly",
        occurrences: 10,
      });
    }
  }, [newEventDialogOpen, date, form, preselectedLessonId]);

  // Dropdown Options
  const selectedClassId = form.watch("classId");
  const isRecurring = form.watch("isRecurring");
  const selectedLessonId = form.watch("lessonId");
  
  const currentClass = useMemo(() => 
    schedulableClasses?.find(c => c._id === selectedClassId), 
  [schedulableClasses, selectedClassId]);

  const classOptions = schedulableClasses?.map(c => ({
    value: c._id,
    label: `${c.name} (${c.curriculumTitle})`
  })) || [];

  const lessonOptions = useMemo(() => {
    const opts = currentClass?.lessons.map(l => ({
      value: l._id,
      label: `${l.order}. ${l.title}`
    })) || [];
    return [{ value: "none", label: t('schedule.noLesson') }, ...opts];
  }, [currentClass, t]);


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
      const endMs = new Date(values.end).getTime();

      if (values.isRecurring) {
        await createRecurring({
          classId: values.classId as Id<"classes">,
          lessonId: finalLessonId,
          title: values.title || undefined,
          description: values.description || undefined,
          scheduledStart: startMs,
          scheduledEnd: endMs,
          recurrence: {
            type: values.recurrenceType,
            occurrences: values.occurrences,
            // Simple logic: repeat on the day of the week of the start date
            daysOfWeek: [new Date(values.start).getDay()],
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
        });
        toast.success(t('schedule.created') || "Event created");
      }

      setNewEventDialogOpen(false);
      setPreselectedLessonId(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to schedule");
    } finally {
      setIsSubmitting(false);
    }
  }

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="lessonId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('navigation.lessons')}</FormLabel>
                  <SelectDropdown 
                    options={lessonOptions} 
                    value={field.value} 
                    onValueChange={field.onChange} 
                    disabled={!selectedClassId}
                    placeholder={t('lesson.selectOptional')} 
                  />
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
                  <FormLabel>{t('schedule.time')}</FormLabel>
                  <DateTimePicker field={field} />
                </FormItem>
              )} />
              <FormField control={form.control} name="end" render={({ field }) => (
                 <FormItem>
                  <FormLabel>End Time</FormLabel>
                  <DateTimePicker field={field} />
                </FormItem>
              )} />
            </div>

            {/* Recurrence Toggle */}
            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/20">
                <FormField control={form.control} name="isRecurring" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg shadow-sm">
                        <div className="space-y-0.5">
                            <FormLabel>{t('schedule.recurring')}</FormLabel>
                        </div>
                        <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                    </FormItem>
                )} />

                {isRecurring && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                         <FormField control={form.control} name="recurrenceType" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Repeat</FormLabel>
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
                            </FormItem>
                        )} />
                        
                        <FormField control={form.control} name="occurrences" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Sessions</FormLabel>
                                <FormControl>
                                    <Input 
                                        type="number" 
                                        {...field} 
                                        onChange={e => field.onChange(parseInt(e.target.value))} 
                                        min={2} 
                                        max={52} 
                                    />
                                </FormControl>
                            </FormItem>
                        )} />
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