"use client"

import { useState, useEffect } from "react"
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
import { Calendar, Plus, Edit, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { DateTimePicker } from "@/components/calendar/form/date-time-picker"

interface ManageScheduleDialogProps {
  classId: Id<"classes">
  trigger?: React.ReactNode
  
  // Create Mode Options
  preselectedLessonId?: Id<"lessons">
  preselectedDate?: Date

  // Edit Mode Options (if scheduleId is present, we are in Edit Mode)
  scheduleId?: Id<"classSchedule">
  initialData?: {
    lessonId?: Id<"lessons">
    title?: string
    description?: string
    start: number
    end: number
    sessionType: "live" | "ignitia"
    isRecurring?: boolean
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
  const isEditing = !!scheduleId
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // --- Form State ---
  // If editing, use initialData; otherwise defaults
  const [lessonId, setLessonId] = useState<Id<"lessons"> | "none" | undefined>(
    initialData?.lessonId || preselectedLessonId || "none"
  )
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

  // Calculate duration from initial data or default to 60
  const [duration, setDuration] = useState(() => {
    if (initialData?.start && initialData?.end) {
      return Math.round((initialData.end - initialData.start) / 1000 / 60)
    }
    return 60
  })

  // Recurrence State (Only for creation currently, or display if editing)
  const [isRecurring, setIsRecurring] = useState(false) // Simplified: Edit series not fully implemented here yet
  const [recurrenceType, setRecurrenceType] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly")
  const [occurrences, setOccurrences] = useState(10)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])

  // --- Data & Mutations ---
  const classes = useQuery(api.classes.getSchedulableClasses)
  const selectedClass = classes?.find(c => c._id === classId)

  // Don't disable the CURRENT lesson if we are editing it
  const usedLessonIds = useQuery(api.schedule.getUsedLessons, { classId })
  
  const createSchedule = useMutation(api.schedule.createSchedule)
  const createRecurring = useMutation(api.schedule.createRecurringSchedule)
  const updateSchedule = useMutation(api.schedule.updateSchedule)
  const deleteSchedule = useMutation(api.schedule.deleteSchedule)

  // Reset form when opening/closing or switching modes
  useEffect(() => {
    if (open) {
      setLessonId(initialData?.lessonId || preselectedLessonId || "none")
      setTitle(initialData?.title || "")
      setDescription(initialData?.description || "")
      setSessionType(initialData?.sessionType || "live")
      
      if (initialData?.start) {
        setStartDate(new Date(initialData.start).toISOString())
        setDuration(Math.round((initialData.end - initialData.start) / 1000 / 60))
      } else {
        const date = preselectedDate || new Date()
        if (!preselectedDate) {
            date.setMinutes(0, 0, 0)
            date.setHours(date.getHours() + 1)
        }
        setStartDate(date.toISOString())
        setDuration(60)
      }
    }
  }, [open, initialData, preselectedLessonId, preselectedDate])


  const handleSubmit = async () => {
    // Validate title if no lesson selected
    if (lessonId === "none" && !title.trim()) {
      toast.error(t("schedule.titleRequired") || "Please enter a title")
      return
    }

    setIsSubmitting(true)

    try {
      const start = new Date(startDate).getTime()
      const end = start + (duration * 60 * 1000)
      const finalLessonId = lessonId === "none" ? undefined : lessonId as Id<"lessons">

      if (isEditing && scheduleId) {
        // --- UPDATE MODE ---
        await updateSchedule({
          id: scheduleId,
          lessonId: finalLessonId === undefined ? null : finalLessonId, // Handle unlinking
          title: title || undefined,
          description: description || undefined,
          scheduledStart: start,
          scheduledEnd: end,
          sessionType,
          // Note: Series update logic omitted for simplicity, defaults to single instance update
        })
        toast.success(t("schedule.updated") || "Schedule updated")
      } else {
        // --- CREATE MODE ---
        if (isRecurring) {
          const finalDaysOfWeek = daysOfWeek.length > 0 ? daysOfWeek : undefined;
          await createRecurring({
            classId,
            lessonId: finalLessonId,
            sessionType,
            title: title || undefined,
            description: description || undefined,
            scheduledStart: start,
            scheduledEnd: end,
            recurrence: {
              type: recurrenceType,
              daysOfWeek: finalDaysOfWeek,
              occurrences,
            },
          });
          toast.success(t("schedule.recurringCreated") || "Series created");
        } else {
          await createSchedule({
            classId,
            lessonId: finalLessonId,
            sessionType,
            title: title || undefined,
            description: description || undefined,
            scheduledStart: start,
            scheduledEnd: end,
          })
          toast.success(t("schedule.created") || "Schedule created")
        }
      }

      setOpen(false)
    } catch (error) {
      toast.error("Failed to save schedule")
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!scheduleId) return
    if (!confirm(t("common.confirmDelete") || "Are you sure?")) return

    setIsSubmitting(true)
    try {
        await deleteSchedule({ id: scheduleId })
        toast.success("Schedule deleted")
        setOpen(false)
    } catch (e) {
        toast.error("Failed to delete")
    } finally {
        setIsSubmitting(false)
    }
  }

  // --- Render Helpers ---
  const toggleDayOfWeek = (day: number) => {
    setDaysOfWeek(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const weekDays = [
    { value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" },
    { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
  ]

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

          {/* Lesson Selection */}
          <div className="space-y-2">
            <Label>{t("lesson.selectOptional") || "Lesson (Optional)"}</Label>
            <Select 
                value={lessonId || "none"} 
                onValueChange={(value) => setLessonId(value as Id<"lessons"> | "none")}
            >
                <SelectTrigger>
                  <SelectValue placeholder="No specific lesson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific lesson</SelectItem>
                  {selectedClass?.lessons.map((lesson) => {
                    // Disable if used, UNLESS it's the one currently assigned to this schedule
                    const isUsed = usedLessonIds?.includes(lesson._id) && lesson._id !== initialData?.lessonId;
                    return (
                        <SelectItem 
                            key={lesson._id} 
                            value={lesson._id} 
                            disabled={isUsed}
                            className={isUsed ? "opacity-50" : ""}
                        >
                        {lesson.order}. {lesson.title} {isUsed && "(Scheduled)"}
                        </SelectItem>
                    )
                  })}
                </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>
              {t("schedule.title") || "Title"}
              {lessonId === "none" && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lessonId !== "none" ? "Override lesson title (optional)" : "e.g., Office Hours"}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("schedule.description") || "Description"}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("schedule.dateTime") || "Start Time"}</Label>
              <DateTimePicker 
                field={{
                    value: startDate,
                    onChange: (val) => setStartDate(val)
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

          {/* Recurring (Only show on create or if already recurring) */}
          {(!isEditing || isRecurring) && (
             <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                <Label>Recurring Schedule</Label>
                <p className="text-sm text-muted-foreground">Create multiple sessions</p>
                </div>
                <Switch checked={isRecurring} onCheckedChange={setIsRecurring} disabled={isEditing} />
            </div>
          )}

          {/* Recurrence Options (Only Create Mode for now) */}
          {isRecurring && !isEditing && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Repeat</Label>
                  <Select value={recurrenceType} onValueChange={(v: any) => setRecurrenceType(v)}>
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
                        {weekDays.map((day) => (
                        <Button
                            key={day.value}
                            type="button"
                            variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleDayOfWeek(day.value)}
                            className="w-12"
                        >
                            {day.label}
                        </Button>
                        ))}
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