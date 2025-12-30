"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCalendarContext } from "../calendar-context";
import { EntityDialog } from "@/components/ui/entity-dialog";
import { Form, FormField, FormItem } from "@/components/ui/form";
import { Label } from "@/components/ui/label"
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

const formSchema = z.object({
  classId: z.string().min(1, "Class is required"),
  lessonId: z.string().min(1, "Lesson is required"),
  start: z.string(),
  end: z.string(),
});

export default function CalendarNewEventDialog() {
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
  const scheduleLesson = useMutation(api.schedule.scheduleLesson);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      classId: "",
      lessonId: "",
      start: date.toISOString(),
      end: new Date(date.getTime() + 60 * 60 * 1000).toISOString(),
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (newEventDialogOpen) {
      form.reset({
        classId: form.getValues("classId") || "",
        lessonId: preselectedLessonId || "",
        start: date.toISOString(),
        end: new Date(date.getTime() + 60 * 60 * 1000).toISOString(),
      });
    }
  }, [newEventDialogOpen, date, form, preselectedLessonId]);

  // Auto-select class if lesson is preselected
  useEffect(() => {
    if (newEventDialogOpen && preselectedLessonId && schedulableClasses) {
      const targetClass = schedulableClasses.find(c => 
        c.lessons.some(l => l._id === preselectedLessonId)
      );
      if (targetClass) {
        form.setValue("classId", targetClass._id);
      }
    }
  }, [newEventDialogOpen, preselectedLessonId, schedulableClasses, form]);

  // Dropdown Options
  const selectedClassId = form.watch("classId");
  
  const currentClass = useMemo(() => 
    schedulableClasses?.find(c => c._id === selectedClassId), 
  [schedulableClasses, selectedClassId]);

  const classOptions = schedulableClasses?.map(c => ({
    value: c._id,
    label: `${c.name} (${c.curriculumTitle})`
  })) || [];

  const lessonOptions = currentClass?.lessons
    .filter(l => !l.isScheduled) // Only show unscheduled lessons
    .map(l => ({
      value: l._id,
      label: `${l.order}. ${l.title}`
    })) || [];

  // Submit Handler
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      await scheduleLesson({
        classId: values.classId as Id<"classes">,
        lessonId: values.lessonId as Id<"lessons">,
        scheduledStart: new Date(values.start).getTime(),
        scheduledEnd: new Date(values.end).getTime(),
      });

      toast.success("Lesson scheduled successfully!");
      setNewEventDialogOpen(false);
      setPreselectedLessonId(null);
    } catch (e) {
      toast.error("Failed to schedule lesson");
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <EntityDialog
      open={newEventDialogOpen}
      onOpenChange={setNewEventDialogOpen}
      title="Schedule Lesson"
      trigger={null}
      onSubmit={form.handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Schedule"
    >
      <Form {...form}>
        <div className="grid gap-4 py-4">
          
          <FormField control={form.control} name="classId" render={({ field }) => (
            <FormItem>
              <Label>Class</Label>
              <SelectDropdown 
                options={classOptions} 
                value={field.value} 
                onValueChange={field.onChange} 
                placeholder="Select Class" 
              />
            </FormItem>
          )} />

          <FormField control={form.control} name="lessonId" render={({ field }) => (
            <FormItem>
              <Label>Lesson</Label>
              <SelectDropdown 
                options={lessonOptions} 
                value={field.value} 
                onValueChange={field.onChange} 
                disabled={!selectedClassId}
                placeholder="Select Lesson" 
              />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="start" render={({ field }) => (
              <FormItem>
                <Label>Start Time</Label>
                <DateTimePicker field={field} />
              </FormItem>
            )} />
            <FormField control={form.control} name="end" render={({ field }) => (
               <FormItem>
                <Label>End Time</Label>
                <DateTimePicker field={field} />
              </FormItem>
            )} />
          </div>

        </div>
      </Form>
    </EntityDialog>
  );
}