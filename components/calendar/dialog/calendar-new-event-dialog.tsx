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
  assignmentId: z.string().min(1, "Course is required"),
  lessonId: z.string().min(1, "Lesson is required"),
  targetAudience: z.string().min(1, "Grade/Group is required"), 
  start: z.string(),
  end: z.string(),
});

export default function CalendarNewEventDialog() {
  const { 
    newEventDialogOpen, 
    setNewEventDialogOpen, 
    date, 
    teacherId,
    preselectedLessonId,
    setPreselectedLessonId 
  } = useCalendarContext();
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const schedulableLessons = useQuery(api.lessons.getSchedulableLessons, teacherId ? { teacherId } : "skip");
  const createScheduledLesson = useMutation(api.lessons.createScheduledLesson);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assignmentId: "",
      lessonId: "",
      targetAudience: "",
      start: date.toISOString(),
      end: new Date(date.getTime() + 60 * 60 * 1000).toISOString(),
    },
  });

  // --- Reset & Pre-fill Logic ---
  useEffect(() => {
    if (newEventDialogOpen) {
      form.reset({
        assignmentId: form.getValues("assignmentId") || "", // Keep selection if exists
        targetAudience: "", // Always reset audience
        lessonId: preselectedLessonId || "", // Pre-fill if shortcut used
        start: date.toISOString(),
        end: new Date(date.getTime() + 60 * 60 * 1000).toISOString(),
      });
    }
  }, [newEventDialogOpen, date, form, preselectedLessonId]);

  // Handle Pre-selection of Course if Shortcut is used
  useEffect(() => {
    if (newEventDialogOpen && preselectedLessonId && schedulableLessons) {
      const targetCourse = schedulableLessons.find(course => 
        course.lessons.some(l => l._id === preselectedLessonId)
      );
      if (targetCourse) {
        form.setValue("assignmentId", targetCourse.assignmentId);
      }
    }
  }, [newEventDialogOpen, preselectedLessonId, schedulableLessons, form]);

  // --- Dropdown Options ---
  
  const selectedAssignmentId = form.watch("assignmentId");
  
  const currentAssignment = useMemo(() => 
    schedulableLessons?.find(a => a.assignmentId === selectedAssignmentId), 
  [schedulableLessons, selectedAssignmentId]);

  const courseOptions = schedulableLessons?.map(a => ({
    value: a.assignmentId,
    label: a.curriculumName
  })) || [];

  const lessonOptions = currentAssignment?.lessons.map(l => ({
    value: l._id,
    label: `Q${l.quarter}: ${l.title}`
  })) || [];

  const audienceOptions = useMemo(() => {
    if (!currentAssignment) return [];
    const options: { value: string; label: string }[] = [];
    
    // Iterate over grades structure: [{ code, groups: [] }, ...]
    currentAssignment.grades.forEach(gradeObj => {
      // 1. Add Groups
      gradeObj.groups.forEach(g => {
        options.push({ value: `group:${g}`, label: `Group ${g}` });
      });
      
      // 2. Add Whole Grade option
      options.push({ value: `grade:${gradeObj.code}`, label: `All ${gradeObj.name}` });
    });
    
    return options;
  }, [currentAssignment]);

  // --- Submit Handler ---
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const [type, code] = values.targetAudience.split(":");
      
      await createScheduledLesson({
        teacherId: teacherId!,
        lessonId: values.lessonId as Id<"curriculum_lessons">,
        assignmentId: values.assignmentId as Id<"teacher_assignments">,
        
        scheduledStart: new Date(values.start).getTime(),
        scheduledEnd: new Date(values.end).getTime(),
        
        // Pass optional context
        gradeCode: type === 'grade' ? code : undefined,
        groupCode: type === 'group' ? code : undefined,
        // Removed 'standards' as it's not in the mutation
      });

      toast.success("Class Scheduled");
      setNewEventDialogOpen(false);
      setPreselectedLessonId(null);
    } catch (e) {
      toast.error("Failed to schedule");
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <EntityDialog
      open={newEventDialogOpen}
      onOpenChange={setNewEventDialogOpen}
      title="Schedule Virtual Class"
      trigger={null} // Controlled by context
      onSubmit={form.handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Schedule"
    >
      <Form {...form}>
        <div className="grid gap-4 py-4">
          
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="assignmentId" render={({ field }) => (
              <FormItem>
                <Label>Course</Label>
                <SelectDropdown 
                  options={courseOptions} 
                  value={field.value} 
                  onValueChange={field.onChange} 
                  placeholder="Select Course" 
                  // Removed 'searchable' prop to fix error
                />
              </FormItem>
            )} />

            <FormField control={form.control} name="targetAudience" render={({ field }) => (
              <FormItem>
                <Label>Class/Group</Label>
                <SelectDropdown 
                  options={audienceOptions} 
                  value={field.value} 
                  onValueChange={field.onChange} 
                  disabled={!selectedAssignmentId}
                  placeholder="Select Audience" 
                />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="lessonId" render={({ field }) => (
            <FormItem>
              <Label>Lesson Topic</Label>
              <SelectDropdown 
                options={lessonOptions} 
                value={field.value} 
                onValueChange={field.onChange} 
                disabled={!selectedAssignmentId}
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