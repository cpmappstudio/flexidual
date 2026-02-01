"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useState, useMemo, useRef } from "react";
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Video, Pencil, CalendarClock, BookOpen, Link as LinkIcon, MonitorPlay, Repeat } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";
import { CalendarEvent } from "../calendar-types";
import { parseConvexError, getErrorMessage } from "@/lib/error-utils";

// Helper function to format recurrence pattern
function formatRecurrencePattern(
  recurrenceRule: string | undefined,
  t: (key: string) => string
): { summary: string; details: string[] } | null {
  if (!recurrenceRule) return null;

  try {
    const rule = JSON.parse(recurrenceRule);
    const details: string[] = [];
    
    // Get recurrence type label
    const typeLabels = {
      daily: t("schedule.recurrence.daily"),
      weekly: t("schedule.recurrence.weekly"),
      biweekly: t("schedule.recurrence.biweekly"),
      monthly: t("schedule.recurrence.monthly"),
    };
    
    const summary = typeLabels[rule.type as keyof typeof typeLabels] || rule.type;
    
    // Add days of week if specified
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const dayLabels = [
        t("days.sunday"),
        t("days.monday"),
        t("days.tuesday"),
        t("days.wednesday"),
        t("days.thursday"),
        t("days.friday"),
        t("days.saturday"),
      ];
      
      const selectedDays = rule.daysOfWeek
        .map((day: number) => dayLabels[day])
        .join(", ");
      
      details.push(`${t("schedule.repeatOn")}: ${selectedDays}`);
    }
    
    // Add occurrences
    if (rule.occurrences) {
      details.push(`${rule.occurrences} ${t("schedule.occurrences").toLowerCase()}`);
    }
    
    // Add end date if specified
    if (rule.endDate) {
      const endDate = new Date(rule.endDate).toLocaleDateString();
      details.push(`${t("schedule.until")}: ${endDate}`);
    }
    
    return { summary, details };
  } catch (error) {
    console.error("Error parsing recurrence rule:", error);
    return null;
  }
}

const formSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string(),
  duration: z.number().min(15).max(240),
  lessonId: z.string().optional(),
  sessionType: z.enum(["live", "ignitia"]),
});

type FormValues = z.infer<typeof formSchema>;

export default function CalendarManageEventDialog() {
  const t = useTranslations();
  const locale = useLocale();
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
  
  // Track last processed event to prevent double renders
  const lastEventIdRef = useRef<string | null>(null);

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

  const defaultValues = useMemo(() => {
    if (!selectedEvent) {
      return {
        title: "",
        description: "",
        start: new Date().toISOString(), // Or appropriate default
        duration: 60,
        lessonId: "none",
        sessionType: "live" as const,
      };
    }

    const durationMs = selectedEvent.end.getTime() - selectedEvent.start.getTime();
    
    return {
      title: selectedEvent.title,
      description: selectedEvent.description || "",
      start: selectedEvent.start.toISOString(),
      duration: Math.round(durationMs / (60 * 1000)),
      lessonId: selectedEvent.lessonId || "none",
      sessionType: (selectedEvent as any).sessionType || "live",
    };
  }, [selectedEvent]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    values: defaultValues
  });

  // Calculate duration from event dates
  const eventDuration = useMemo(() => {
    if (!selectedEvent) return 60;
    const durationMs = selectedEvent.end.getTime() - selectedEvent.start.getTime();
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
        description: selectedEvent.description || "",
        start: selectedEvent.start.toISOString(),
        duration: eventDuration,
        lessonId: selectedEvent.lessonId || "none",
        sessionType: (selectedEvent as CalendarEvent).sessionType || "live",
      });
      setUpdateMode("single");
    }
  }, [manageEventDialogOpen, selectedEvent, form, eventDuration, isEditing]);

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
            ? `${l.order}. ${l.title} (${t("schedule.scheduled")})` 
            : `${l.order}. ${l.title}`,
        disabled: isUsed
      };
    });
    
    return [
      { value: "none", label: t('lesson.noLesson') || "No linked lesson", disabled: false }, 
      ...opts
    ];
  }, [lessons, t, usedLessonIds, selectedEvent]);

  // Get recurrence pattern info - check parent if this is a child occurrence
  const recurrenceInfo = useMemo(() => {
    if (selectedEvent?.recurrenceRule) {
      return formatRecurrencePattern(selectedEvent.recurrenceRule, t);
    }
    return null;
  }, [selectedEvent?.recurrenceRule, t]);

  async function onSubmit(values: FormValues) {
    if (!selectedEvent?.scheduleId) return;

    setIsSubmitting(true);
    try {
      const finalLessonId = values.lessonId === "none" ? null : values.lessonId as Id<"lessons">;
      const startMs = new Date(values.start).getTime();

      await updateSchedule({
        id: selectedEvent.scheduleId,
        title: values.title,
        description: values.description,
        scheduledStart: startMs,
        scheduledEnd: startMs + (values.duration * 60 * 1000),
        lessonId: finalLessonId,
        sessionType: values.sessionType,
        updateSeries: updateMode === "series",
      });

      toast.success(t('schedule.scheduleUpdated'));
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

      toast.success(t('schedule.deleted'));
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

  // Check if this is part of a series (either parent or child)
  const isSeries = selectedEvent.isRecurring || !!selectedEvent.recurrenceParentId;
  const duration = Math.round((selectedEvent.end.getTime() - selectedEvent.start.getTime()) / (60 * 1000));

  return (
    <>
      <Dialog open={manageEventDialogOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-start justify-between space-y-0 pt-2 pr-4">
            <DialogTitle>
                {isEditing ? t('common.edit') : t('schedule.viewDetails')}
            </DialogTitle>
            
            {selectedEvent.status !== "cancelled" && (
                <div className="flex gap-2">
                    {isEditing ? (
                        <Button variant="destructive" size="icon" onClick={() => setDeleteDialogOpen(true)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button variant="outline" size="icon" onClick={() => setIsEditing(true)}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
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

                            {(selectedEvent as CalendarEvent).sessionType === "ignitia" ? (
                                <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">
                                    <MonitorPlay className="h-3 w-3 mr-1" />
                                    {t("schedule.typeIgnitia")}
                                </Badge>
                            ) : (
                                <Badge variant="secondary">
                                    <Video className="h-3 w-3 mr-1" />
                                    {t("schedule.typeLive")}
                                </Badge>
                            )}
                            
                            {(selectedEvent as CalendarEvent).lessonId ? (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" />
                                    {t('lesson.linked')}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-muted-foreground border-dashed">
                                    {t('lesson.noLesson')}
                                </Badge>
                            )}

                            {selectedEvent.isLive && (
                                <Badge variant="destructive" className="animate-pulse">
                                    <span className="relative flex h-2 w-2 mr-1">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                    </span>
                                    {t('common.live')}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 text-sm">
                    {/* Teacher Info */}
                    <div className="flex gap-3">
                        <div className="shrink-0">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 border-2 border-white dark:border-gray-800 shadow-lg flex items-center justify-center overflow-hidden">
                                {selectedEvent.teacherImageUrl ? (
                                    <Image 
                                        src={selectedEvent.teacherImageUrl} 
                                        alt="avatar" 
                                        width={48}
                                        height={48}
                                        className="w-full h-full object-cover" 
                                    />
                                ) : (
                                    <span className="text-lg font-bold text-white">
                                    {selectedEvent.teacherName?.charAt(0) || 'T'}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                            <p className="font-medium text-lg leading-none">{selectedEvent.className}</p>
                            {selectedEvent.teacherName && (
                                <p className="text-sm text-muted-foreground mt-1">
                                    {t('common.with')} {selectedEvent.teacherName}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Date & Time */}
                    <div className="flex gap-3">
                        <CalendarClock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">
                                {selectedEvent.start.toLocaleDateString(locale, { 
                                    weekday: 'long', 
                                    month: 'long', 
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </p>
                            <p className="text-muted-foreground">
                                {selectedEvent.start.toLocaleTimeString(locale, {hour: '2-digit', minute:'2-digit'})} - 
                                {selectedEvent.end.toLocaleTimeString(locale, {hour: '2-digit', minute:'2-digit'})}
                                <span className="text-xs ml-2">({duration} {t("schedule.minutes")})</span>
                            </p>
                        </div>
                    </div>

                    {/* Recurrence Pattern - Show for all occurrences in a series */}
                    {recurrenceInfo && (
                        <div className="flex gap-3">
                            <Repeat className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium flex items-center gap-2">
                                    {recurrenceInfo.summary}
                                    <Badge variant="secondary" className="text-xs">
                                        {t("schedule.recurring")}
                                    </Badge>
                                </p>
                                {recurrenceInfo.details.length > 0 && (
                                    <ul className="text-sm text-muted-foreground mt-1 space-y-0.5">
                                        {recurrenceInfo.details.map((detail, idx) => (
                                            <li key={idx}>• {detail}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    {selectedEvent.description && (
                        <div className="flex gap-3">
                            <BookOpen className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-muted-foreground whitespace-pre-wrap">{selectedEvent.description}</p>
                        </div>
                    )}
                    
                    {/* Lesson Link */}
                    {selectedEvent.lessonId && (
                         <div className="flex gap-3">
                            <LinkIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <Link href={`/lessons/${selectedEvent.lessonId}`} className="text-primary hover:underline font-medium">
                                {t('schedule.viewLessonContent')}
                            </Link>
                        </div>
                    )}
                </div>
                
                {/* Action Button */}
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
             <Form {...form} key={selectedEvent.scheduleId}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    
                    {/* Series vs Single Logic */}
                    {isSeries && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md border border-amber-200 dark:border-amber-900">
                             <FormLabel className="mb-2 block text-amber-900 dark:text-amber-100">
                                {t('schedule.updateSchedule')}
                             </FormLabel>
                             <RadioGroup 
                                value={updateMode} 
                                onValueChange={(v) => setUpdateMode(v as "single" | "series")} 
                                className="flex flex-col sm:flex-row gap-4"
                             >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="single" id="r1" />
                                    <FormLabel htmlFor="r1" className="font-normal cursor-pointer">
                                        {t('schedule.editOccurrence')}
                                    </FormLabel>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="series" id="r2"/>
                                    <FormLabel htmlFor="r2" className="font-normal cursor-pointer">
                                        {t('schedule.editSeries')}
                                    </FormLabel>
                                </div>
                             </RadioGroup>
                        </div>
                    )}
                    
                    {/* Session Type */}
                    <FormField control={form.control} name="sessionType" render={({ field }) => (
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
                                    <FormLabel htmlFor="edit-live" className="font-normal cursor-pointer">
                                        {t("schedule.typeLive")}
                                    </FormLabel>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="ignitia" id="edit-ignitia" />
                                    <FormLabel htmlFor="edit-ignitia" className="font-normal cursor-pointer">
                                        {t("schedule.typeIgnitia")}
                                    </FormLabel>
                                </div>
                            </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    {/* Lesson Selector */}
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

                    {/* Title */}
                    <FormField control={form.control} name="title" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('schedule.title')}</FormLabel>
                            <FormControl><Input {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    {/* Description */}
                    <FormField control={form.control} name="description" render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t('curriculum.description')}</FormLabel>
                            <FormControl>
                                <Textarea {...field} className="resize-none h-20" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />

                    {/* Start Time & Duration */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="start" render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('schedule.dateTime')}</FormLabel>
                                <DateTimePicker field={field} />
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        <FormField control={form.control} name="duration" render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('schedule.duration')}</FormLabel>
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
                : t('schedule.deleteConfirm')
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
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('schedule.deleteOccurrence')}
                    </Button>
                    <Button variant="destructive" onClick={() => handleDelete(true)} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('schedule.deleteSeries')}
                    </Button>
                </>
            ) : (
                <Button variant="destructive" onClick={() => handleDelete(false)} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.delete')}
                </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}