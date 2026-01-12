"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useState, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
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
import { Textarea } from "@/components/ui/textarea";
import { useCalendarContext } from "../calendar-context";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Video, Pencil, CalendarClock, BookOpen, School, Link as LinkIcon, Unlink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SelectDropdown } from "@/components/ui/select-dropdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string(),
  end: z.string(),
  lessonId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CalendarManageEventDialog() {
  const t = useTranslations();
  const {
    manageEventDialogOpen,
    setManageEventDialogOpen,
    selectedEvent,
    setSelectedEvent,
  } = useCalendarContext();

  const [isEditing, setIsEditing] = useState(false);
  const [updateMode, setUpdateMode] = useState<"single" | "series">("single");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Queries for Edit Mode
  // 1. Get Class details to know the curriculum
  const classData = useQuery(
    api.classes.get, 
    isEditing && selectedEvent ? { id: selectedEvent.classId } : "skip"
  );
  
  // 2. Get Lessons for that curriculum
  const lessons = useQuery(
    api.lessons.listByCurriculum,
    classData ? { curriculumId: classData.curriculumId } : "skip"
  );

  // 3. Get Used Lessons in this class to prevent duplicates
  const usedLessonIds = useQuery(
    api.schedule.getUsedLessons,
    selectedEvent ? { classId: selectedEvent.classId } : "skip"
  );

  // Convex mutations
  const updateSchedule = useMutation(api.schedule.updateSchedule);
  const deleteSchedule = useMutation(api.schedule.deleteSchedule);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      start: "",
      end: "",
      lessonId: "none",
    },
  });

  useEffect(() => {
    if (selectedEvent) {
      form.reset({
        title: selectedEvent.title,
        description: selectedEvent.description || "",
        start: selectedEvent.start.toISOString(),
        end: selectedEvent.end.toISOString(),
        lessonId: selectedEvent.lessonId || "none",
      });
      setUpdateMode("single");
      setIsEditing(false); 
    }
  }, [selectedEvent, form, manageEventDialogOpen]);

  // Transform lessons for dropdown
  const lessonOptions = useMemo(() => {
    if (!lessons) return [];
    
    const currentLessonId = selectedEvent?.lessonId;

    const opts = lessons.map(l => {
      // Disable if used by another schedule, but allow if it's the currently selected one
      const isUsed = usedLessonIds?.includes(l._id) && l._id !== currentLessonId;
      
      return {
        value: l._id,
        label: isUsed 
            ? `${l.order}. ${l.title} (Scheduled)` 
            : `${l.order}. ${l.title}`,
        disabled: isUsed
      };
    });
    
    return [
      { value: "none", label: t('lesson.noLesson') || "No linked lesson", disabled: false }, 
      ...opts
    ];
  }, [lessons, t, usedLessonIds, selectedEvent]);

  async function onSubmit(values: FormValues) {
    if (!selectedEvent?.scheduleId) return;

    setIsSubmitting(true);
    try {
      const finalLessonId = values.lessonId === "none" ? null : values.lessonId as Id<"lessons">;

      await updateSchedule({
        id: selectedEvent.scheduleId,
        title: values.title,
        description: values.description,
        scheduledStart: new Date(values.start).getTime(),
        scheduledEnd: new Date(values.end).getTime(),
        lessonId: finalLessonId, // Pass the new lesson ID (or null to unlink)
        updateSeries: updateMode === "series",
      });

      toast.success(t('schedule.scheduleUpdated'));
      handleClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
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

      toast.success(t('class.deleted'));
      setDeleteDialogOpen(false);
      handleClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setManageEventDialogOpen(false);
    setTimeout(() => {
        setSelectedEvent(null);
        setIsEditing(false);
    }, 300);
  }

  if (!selectedEvent) return null;

  const isSeries = !!selectedEvent.isRecurring;

  return (
    <>
      <Dialog open={manageEventDialogOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <DialogTitle>
                {isEditing ? t('common.edit') : t('schedule.viewDetails')}
            </DialogTitle>
            
            {!isEditing && selectedEvent.status !== "cancelled" && (
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => setIsEditing(true)}>
                        <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => setDeleteDialogOpen(true)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )}
          </DialogHeader>

          {!isEditing ? (
             /* VIEW MODE */
             <div className="space-y-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">{selectedEvent.title}</h2>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" style={{ borderColor: selectedEvent.color, color: selectedEvent.color }}>
                                {selectedEvent.curriculumTitle}
                            </Badge>
                            
                            {/* Lesson Linked Indicator */}
                            {selectedEvent.lessonId ? (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" />
                                    {t('lesson.linked') || "Linked Lesson"}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-muted-foreground border-dashed">
                                    {t('lesson.noLesson') || "No Lesson"}
                                </Badge>
                            )}

                            {selectedEvent.isLive && (
                                <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
                            )}
                            {isSeries && (
                                <Badge variant="secondary">Recurring</Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 text-sm">
                    <div className="flex gap-3">
                        <CalendarClock className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                            <p className="font-medium">
                                {selectedEvent.start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            </p>
                            <p className="text-muted-foreground">
                                {selectedEvent.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                                {selectedEvent.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <School className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                            <p className="font-medium">{selectedEvent.className}</p>
                        </div>
                    </div>

                    {selectedEvent.description && (
                        <div className="flex gap-3">
                            <BookOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                            <p className="text-muted-foreground whitespace-pre-wrap">{selectedEvent.description}</p>
                        </div>
                    )}
                    
                    {/* Lesson Content Preview Link if linked */}
                    {selectedEvent.lessonId && (
                         <div className="flex gap-3">
                            <LinkIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                            <Link href={`/lessons/${selectedEvent.lessonId}`} className="text-primary hover:underline font-medium">
                                View Lesson Content
                            </Link>
                        </div>
                    )}
                </div>
                
                <div className="flex justify-end pt-4">
                    {selectedEvent.isLive ? (
                        <Button className="w-full sm:w-auto bg-green-600 hover:bg-green-700" asChild>
                            <Link href={`/classroom/${selectedEvent.roomName}`}>
                                <Video className="mr-2 h-4 w-4" />
                                {t('dashboard.enterLive')}
                            </Link>
                        </Button>
                    ) : (
                        <Button className="w-full sm:w-auto" variant="outline" asChild>
                            <Link href={`/classroom/${selectedEvent.roomName}`}>
                                {t('classroom.prepareRoom')}
                            </Link>
                        </Button>
                    )}
                </div>
             </div>
          ) : (
             /* EDIT MODE */
             <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    
                    {/* Series vs Single Logic - Fixed Radio Group */}
                    {isSeries && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md border border-amber-200 dark:border-amber-900">
                             <FormLabel className="mb-2 block text-amber-900 dark:text-amber-100">{t('schedule.updateSchedule')}</FormLabel>
                             <RadioGroup 
                                value={updateMode} 
                                onValueChange={(v) => setUpdateMode(v as "single" | "series")} 
                                className="flex flex-col sm:flex-row gap-4"
                             >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="single" id="r1" />
                                    <FormLabel htmlFor="r1" className="font-normal cursor-pointer">{t('schedule.editOccurrence')}</FormLabel>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="series" id="r2" />
                                    <FormLabel htmlFor="r2" className="font-normal cursor-pointer">{t('schedule.editSeries')}</FormLabel>
                                </div>
                             </RadioGroup>
                        </div>
                    )}

                    {/* Lesson Selector - New Feature */}
                    <FormField control={form.control} name="lessonId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('navigation.lessons')}</FormLabel>
                             <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                                disabled={!lessons}
                             >
                                <FormControl>
                                <SelectTrigger>
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
                                            {opt.label}
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
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <FormField control={form.control} name="description" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('curriculum.description')}</FormLabel>
                            <FormControl><Textarea {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="start" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Start</FormLabel>
                                <DateTimePicker field={field} />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="end" render={({ field }) => (
                            <FormItem>
                                <FormLabel>End</FormLabel>
                                <DateTimePicker field={field} />
                            </FormItem>
                        )} />
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </form>
             </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.delete')}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isSeries 
                ? t('schedule.deleteSeriesPrompt') 
                : t('lesson.deleteConfirm')
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={isSubmitting}>
                {t('common.cancel')}
            </AlertDialogCancel>
            
            {isSeries ? (
                <>
                    <Button variant="destructive" onClick={() => handleDelete(false)} disabled={isSubmitting}>
                        {t('schedule.deleteOccurrence')}
                    </Button>
                    <Button variant="destructive" onClick={() => handleDelete(true)} disabled={isSubmitting}>
                        {t('schedule.deleteSeries')}
                    </Button>
                </>
            ) : (
                <Button variant="destructive" onClick={() => handleDelete(false)} disabled={isSubmitting}>
                    {t('common.delete')}
                </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}