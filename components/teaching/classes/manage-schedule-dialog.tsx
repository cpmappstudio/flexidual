"use client"

import { useState, useEffect, useRef } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Calendar, Plus, Edit, Loader2, Trash2, CalendarClock, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"
import { DateTimePicker } from "@/components/calendar/form/date-time-picker"
import { RecurrenceType } from "@/lib/types/schedule"
import { parseConvexError, getErrorMessage } from "@/lib/error-utils"
import { getSmartStartDate } from "@/lib/date-utils"
import { useAlert } from "@/components/providers/alert-provider"

interface ManageScheduleDialogProps {
  classId: Id<"classes">
  trigger?: React.ReactNode
  
  // Create Mode Options
  preselectedLessonId?: Id<"lessons">
  preselectedDate?: Date

  // Edit Mode Options (if scheduleId is present, we are in Edit Mode)
  scheduleId?: Id<"classSchedule">
  initialData?: {
    lessonIds?: Id<"lessons">[]
    title?: string
    description?: string
    start: number
    end: number
    sessionType: "live" | "ignitia"
    isRecurring?: boolean
    recurrenceParentId?: Id<"classSchedule">
  }
}

export function ManageScheduleDialog({ 
  classId, 
  trigger,
  preselectedLessonId,
  preselectedDate,
  scheduleId,
  initialData
}: ManageScheduleDialogProps) {
  const t = useTranslations()
  const { showAlert } = useAlert()
  const locale = useLocale()
  const isEditing = !!scheduleId
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Changed to array for multiple lessons
  const [lessonIds, setLessonIds] = useState<Id<"lessons">[]>(() => {
    if (initialData?.lessonIds && initialData.lessonIds.length > 0) {
      return initialData.lessonIds
    }
    if (preselectedLessonId) {
      return [preselectedLessonId]
    }
    return []
  })
  
  const [title, setTitle] = useState(initialData?.title || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [sessionType, setSessionType] = useState<"live" | "ignitia">(
    initialData?.sessionType || "live"
  )
  
  // Date State
  const [startDate, setStartDate] = useState<string>(() => {
    if (initialData?.start) return new Date(initialData.start).toISOString()
    
    const date = preselectedDate || new Date()
    if (!preselectedDate) {
      date.setMinutes(0, 0, 0)
      date.setHours(date.getHours() + 1)
    }
    return date.toISOString()
  })

  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date(startDate))

  const [duration, setDuration] = useState(() => {
    if (initialData?.start && initialData?.end) {
      return Math.round((initialData.end - initialData.start) / 1000 / 60)
    }
    return 60
  })

  // Recurrence State
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly")
  const [occurrences, setOccurrences] = useState(10)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])
  const prevDaysRef = useRef<number[]>([])
  const [updateSeries, setUpdateSeries] = useState(false);

  // --- Data & Mutations ---
  const classes = useQuery(api.classes.getSchedulableClasses)
  const selectedClass = classes?.find(c => c._id === classId)
  const lessons = useQuery(
    api.lessons.listByCurriculum,
    selectedClass ? { curriculumId: selectedClass.curriculumId } : "skip"
  )
  const usedLessonIds = useQuery(api.schedule.getUsedLessons, { classId })
  const createSchedule = useMutation(api.schedule.createSchedule)
  const createRecurring = useMutation(api.schedule.createRecurringSchedule)
  const updateSchedule = useMutation(api.schedule.updateSchedule)
  const deleteSchedule = useMutation(api.schedule.deleteSchedule)

  // Reset form when opening
  useEffect(() => {
    if (open) {
      // ✅ Updated: Handle both formats
      if (initialData?.lessonIds && initialData.lessonIds.length > 0) {
        setLessonIds(initialData.lessonIds)
      } else if (preselectedLessonId) {
        setLessonIds([preselectedLessonId])
      } else {
        setLessonIds([])
      }
      
      setTitle(initialData?.title || "")
      setDescription(initialData?.description || "")
      setSessionType(initialData?.sessionType || "live")
      
      let initialStartStr = ""
      if (initialData?.start) {
        initialStartStr = new Date(initialData.start).toISOString()
        setDuration(Math.round((initialData.end - initialData.start) / 1000 / 60))
      } else {
        const date = preselectedDate || new Date()
        if (!preselectedDate) {
          date.setMinutes(0, 0, 0)
          date.setHours(date.getHours() + 1)
        }
        initialStartStr = date.toISOString()
        setDuration(60)
      }
      
      setStartDate(initialStartStr)
      setAnchorDate(new Date(initialStartStr))
      setIsRecurring(initialData?.isRecurring || false)
      setDaysOfWeek([])
      prevDaysRef.current = []
      setUpdateSeries(false)
    }
  }, [open, initialData, preselectedLessonId, preselectedDate])


  useEffect(() => {
    if (!daysOfWeek || daysOfWeek.length === 0) return
    
    // Check if days actually changed
    const daysChanged = JSON.stringify(daysOfWeek) !== JSON.stringify(prevDaysRef.current)
    if (!daysChanged) return

    prevDaysRef.current = daysOfWeek

    // Use anchorDate as the base
    const smartStartDate = getSmartStartDate(anchorDate, daysOfWeek)
    const currentFormDate = new Date(startDate)
    
    if (smartStartDate.getTime() !== currentFormDate.getTime()) {
      setStartDate(smartStartDate.toISOString())

      toast.info(t('schedule.dateAdjusted') || "Start Date Adjusted", {
        description: t('schedule.dateAdjustedDesc', { 
            date: smartStartDate.toLocaleDateString(undefined, { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
            }) 
        }) || `Moved to ${smartStartDate.toLocaleDateString()} to match pattern.`,
        duration: 3000,
        icon: <CalendarClock className="h-4 w-4 text-blue-500" />
      })
    }
  }, [daysOfWeek, anchorDate, startDate, t])

  useEffect(() => {
    if (open && isEditing && initialData?.isRecurring) {
      setLessonIds([]);
      setIsRecurring(true);
    }
  }, [open, isEditing, initialData]);


  const handleSubmit = async () => {
    // Validation: Title required if no lessons
    if (lessonIds.length === 0 && !title.trim()) {
      toast.error(t("schedule.titleRequired") || "Please enter a title or select at least one lesson")
      return
    }

    // Block recurring with lessons
    if (isRecurring && lessonIds.length > 0) {
      toast.error(t("schedule.recurringNoLessons") || "Cannot create recurring schedules with lessons. Create individual schedules instead.")
      return
    }

    setIsSubmitting(true)

    try {
      const start = new Date(startDate).getTime()
      const end = start + (duration * 60 * 1000)
      const finalLessonIds = lessonIds.length > 0 ? lessonIds : undefined
      const timezoneOffset = new Date().getTimezoneOffset()

      if (isEditing && scheduleId) {
        await updateSchedule({
          id: scheduleId,
          lessonIds: finalLessonIds,
          title: title || undefined,
          description: description || undefined,
          scheduledStart: start,
          scheduledEnd: end,
          sessionType,
          updateSeries,
        })
        toast.success(t("schedule.scheduleUpdated"))
      } else {
        if (isRecurring) {
          const finalDaysOfWeek = daysOfWeek.length > 0 ? daysOfWeek : undefined;
          await createRecurring({
            classId,
            lessonIds: undefined, // Always undefined for recurring
            sessionType,
            title: title || undefined,
            description: description || undefined,
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
            title: title || undefined,
            description: description || undefined,
            scheduledStart: start,
            scheduledEnd: end,
          })
          toast.success(t("schedule.created"))
        }
      }

      setOpen(false)
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
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!scheduleId) return

    showAlert({
        title: t('common.delete'),
        description: t('schedule.deleteConfirm'),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        variant: "destructive",
        onConfirm: async () => {
            setIsSubmitting(true)
            try {
                await deleteSchedule({ id: scheduleId })
                toast.success(t('schedule.deleted'))
                setOpen(false)
            } catch {
                toast.error(t('schedule.deleteFailed'))
            } finally {
                setIsSubmitting(false)
            }
        }
    })
  }

  // Helper to toggle lesson selection
  const toggleLesson = (id: Id<"lessons">) => {
    setLessonIds(prev => 
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    )
  }

  const weekDays = [
    { value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" },
    { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
  ]

  const currentStartDayIndex = new Date(startDate).getDay()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          isEditing ? (
             <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <Edit className="h-4 w-4 text-muted-foreground" />
            </Button>
          ) : (
            <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("schedule.create") || "Create"}
            </Button>
          )
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <Edit className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
            {isEditing 
                ? t("schedule.edit") || "Edit Schedule" 
                : t("schedule.createNew") || "Create New Schedule"
            }
          </DialogTitle>
          <DialogDescription>
            {isEditing 
                ? t("schedule.editDescription") || "Update session details"
                : t("schedule.createDescription") || "Schedule a class session"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isEditing && (initialData?.isRecurring || initialData?.recurrenceParentId) && (
            <div className="p-4 border-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 space-y-3">
              <Label className="text-base font-semibold text-blue-900 dark:text-blue-100">
                {t('schedule.updateScope') || "What do you want to update?"}
              </Label>
              
              <RadioGroup 
                value={updateSeries ? "series" : "instance"} 
                onValueChange={(v) => {
                  const willUpdateSeries = v === "series";
                  setUpdateSeries(willUpdateSeries);
                  
                  if (willUpdateSeries) {
                    setLessonIds([]);
                  }
                }}
                className="flex flex-col gap-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors">
                  <RadioGroupItem value="instance" id="scope-instance" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="scope-instance" className="font-medium cursor-pointer">
                      {t('schedule.thisEventOnly') || "Just this event"}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('schedule.instanceNote') || "Changes only affect this occurrence. You can add/remove lessons."}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-3 rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors">
                  <RadioGroupItem value="series" id="scope-series" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="scope-series" className="font-medium cursor-pointer">
                      {t('schedule.allFutureEvents') || "All future events"}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('schedule.seriesUpdateNote') || "Changes affect all future occurrences. Cannot add/remove lessons."}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          )}
          
          {/* Session Type */}
          <div className="space-y-3">
            <Label>{t('schedule.sessionType') || "Session Type"}</Label>
            <RadioGroup
              value={sessionType}
              onValueChange={(v) => setSessionType(v as "live" | "ignitia")}
              className="flex flex-row space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="live" id="st-live" />
                <Label htmlFor="st-live" className="font-normal cursor-pointer">Live Class</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ignitia" id="st-ignitia" />
                <Label htmlFor="st-ignitia" className="font-normal cursor-pointer">Ignitia Lesson</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Multi-Select Lesson UI */}
          <div className="space-y-2">
            <Label>
              {t("lesson.selectOptional") || "Lessons (Optional)"}
              {lessonIds.length > 0 && <span className="ml-2 text-xs text-muted-foreground">({lessonIds.length} selected)</span>}
            </Label>

            {isEditing && updateSeries && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-md p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                      {t('schedule.seriesLessonsBlocked') || "Lessons locked for series updates"}
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                      {t('schedule.switchToInstance') || "Switch to 'Just this event' to add lessons to this specific occurrence."}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {!isEditing && isRecurring && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 rounded-md p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                      {t('schedule.recurringNoLessonsTitle') || "Recurring schedules cannot have lessons at creation"}
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                      {t('schedule.recurringNoLessonsDesc') || "You can add lessons to individual occurrences after creation by editing them."}
                    </p>
                  </div>
                </div>
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
                    const isUsed = usedLessonIds?.includes(lesson._id) && 
                      !initialData?.lessonIds?.includes(lesson._id);
                    const isSelected = lessonIds.includes(lesson._id);
                    const isDisabled = 
                      isUsed || 
                      (!isEditing && isRecurring) ||
                      (isEditing && updateSeries);

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
                              {/* NOW WORKS: lesson has description property */}
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
          <div className="space-y-2">
            <Label>
              {t("schedule.title") || "Title"}
              {lessonIds.length === 0 && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lessonIds.length > 0 ? "Override lesson title (optional)" : "e.g., Office Hours"}
            />
            {lessonIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("schedule.titleOverrideHint") || "Leave empty to use first lesson's title"}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("schedule.description") || "Description"}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("schedule.descriptionPlaceholder") || "Optional session notes..."}
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("schedule.dateTime") || "Start Time"}</Label>
              <DateTimePicker 
                field={{
                    value: startDate,
                    onChange: (val) => {
                        setStartDate(val)
                        setAnchorDate(new Date(val))
                    }
                }} 
              />
            </div>
            <div className="space-y-2">
              <Label>{t("schedule.duration") || "Duration"}</Label>
              <Select value={duration.toString()} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring Toggle */}
          {(!isEditing || isRecurring) && (
             <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label>Recurring Schedule</Label>
                  <p className="text-sm text-muted-foreground">Create multiple sessions</p>
                </div>
                <Switch 
                  checked={isRecurring} 
                  onCheckedChange={(checked) => {
                    setIsRecurring(checked)
                    // Clear lessons when enabling recurring
                    if (checked) {
                      setLessonIds([])
                    }
                  }} 
                  disabled={isEditing} 
                />
            </div>
          )}

          {/* Recurrence Options */}
          {isRecurring && !isEditing && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Repeat</Label>
                  <Select 
                    value={recurrenceType} 
                    onValueChange={(v) => setRecurrenceType(v as RecurrenceType)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Occurrences</Label>
                  <Input type="number" min={1} max={52} value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value))} />
                </div>
              </div>
              
              {(recurrenceType !== "monthly") && (
                  <div className="space-y-2">
                    <Label>Repeat on</Label>
                    <div className="flex flex-wrap gap-2">
                        {weekDays.map((day) => {
                            const isStartDay = day.value === currentStartDayIndex
                            const toggleDayOfWeek = (dayVal: number) => {
                              setDaysOfWeek(prev => 
                                prev.includes(dayVal) ? prev.filter(d => d !== dayVal) : [...prev, dayVal].sort()
                              )
                            }

                            return (
                                <Button
                                    key={day.value}
                                    type="button"
                                    variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleDayOfWeek(day.value)}
                                    className={`w-12 ${isStartDay ? "ring-2 ring-offset-2 ring-blue-500 dark:ring-blue-400" : ""}`}
                                    title={isStartDay ? "Current Start Date" : undefined}
                                >
                                    {day.label}
                                </Button>
                            )
                        })}
                    </div>
                  </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isEditing && (
              <Button variant="destructive" type="button" onClick={handleDelete} disabled={isSubmitting} className="mr-auto">
                 {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}