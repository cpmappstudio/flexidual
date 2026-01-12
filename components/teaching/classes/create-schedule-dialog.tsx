"use client"

import { useState } from "react"
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
import { Calendar, Plus } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { DateTimePicker } from "@/components/calendar/form/date-time-picker" // Added

interface CreateScheduleDialogProps {
  classId?: Id<"classes">
  initialDate?: Date
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function CreateScheduleDialog({ 
  classId: initialClassId, 
  initialDate,
  trigger,
  onSuccess 
}: CreateScheduleDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form state
  const [classId, setClassId] = useState<Id<"classes"> | undefined>(initialClassId)
  const [lessonId, setLessonId] = useState<Id<"lessons"> | "none" | undefined>("none")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  
  // Changed: Default to ISO string for DateTimePicker compatibility
  const [startDate, setStartDate] = useState(() => {
    const date = initialDate || new Date()
    // Round to next hour
    date.setMinutes(0, 0, 0)
    date.setHours(date.getHours() + 1)
    return date.toISOString() // DateTimePicker expects ISO
  })
  
  const [duration, setDuration] = useState(60) // minutes
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly")
  const [occurrences, setOccurrences] = useState(10)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])

  // Queries
  const classes = useQuery(api.classes.getSchedulableClasses)
  const selectedClass = classes?.find(c => c._id === classId)

  const usedLessonIds = useQuery(
    api.schedule.getUsedLessons,
    classId ? { classId } : "skip"
  )
  
  // Mutations
  const createSchedule = useMutation(api.schedule.createSchedule)
  const createRecurring = useMutation(api.schedule.createRecurringSchedule)

  const handleSubmit = async () => {
    if (!classId) {
      toast.error(t("schedule.selectClass") || "Please select a class")
      return
    }

    // Validate title if no lesson selected
    if (lessonId === "none" && !title.trim()) {
      toast.error(t("schedule.titleRequired") || "Please enter a title")
      return
    }

    setIsSubmitting(true)

    try {
      const start = new Date(startDate).getTime()
      const end = start + (duration * 60 * 1000)

      // Convert "none" to undefined for the mutation
      const finalLessonId = lessonId === "none" ? undefined : lessonId as Id<"lessons">

      if (isRecurring) {
        await createRecurring({
          classId,
          lessonId: finalLessonId,
          title: title || undefined,
          description: description || undefined,
          scheduledStart: start,
          scheduledEnd: end,
          recurrence: {
            type: recurrenceType,
            daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
            occurrences,
          },
        })
        toast.success(t("schedule.recurringCreated") || `${occurrences} sessions created successfully`)
      } else {
        await createSchedule({
          classId,
          lessonId: finalLessonId,
          title: title || undefined,
          description: description || undefined,
          scheduledStart: start,
          scheduledEnd: end,
        })
        toast.success(t("schedule.created") || "Schedule created successfully")
      }

      setOpen(false)
      resetForm()
      onSuccess?.()
    } catch (error) {
      toast.error((error as Error).message || t("schedule.createError") || "Failed to create schedule")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    if (!initialClassId) setClassId(undefined)
    setLessonId("none")
    setTitle("")
    setDescription("")
    const nextHour = new Date()
    nextHour.setMinutes(0, 0, 0)
    nextHour.setHours(nextHour.getHours() + 1)
    setStartDate(nextHour.toISOString())
    setDuration(60)
    setIsRecurring(false)
    setRecurrenceType("weekly")
    setOccurrences(10)
    setDaysOfWeek([])
  }

  const toggleDayOfWeek = (day: number) => {
    setDaysOfWeek(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const weekDays = [
    { value: 0, label: t("days.sunday") || "Sun" },
    { value: 1, label: t("days.monday") || "Mon" },
    { value: 2, label: t("days.tuesday") || "Tue" },
    { value: 3, label: t("days.wednesday") || "Wed" },
    { value: 4, label: t("days.thursday") || "Thu" },
    { value: 5, label: t("days.friday") || "Fri" },
    { value: 6, label: t("days.saturday") || "Sat" },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("schedule.create") || "Create Schedule"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("schedule.createNew") || "Create New Schedule"}
          </DialogTitle>
          <DialogDescription>
            {t("schedule.createDescription") || "Schedule a class session with optional lesson content"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Class Selection */}
          {!initialClassId && (
            <div className="space-y-2">
              <Label>{t("class.selectClass") || "Select Class"}</Label>
              <Select value={classId} onValueChange={(value) => setClassId(value as Id<"classes">)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("class.selectPlaceholder") || "Choose a class..."} />
                </SelectTrigger>
                <SelectContent>
                  {classes?.map((cls) => (
                    <SelectItem key={cls._id} value={cls._id}>
                      {cls.name} - {cls.curriculumTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Lesson Selection (Optional) */}
          {classId && (
            <div className="space-y-2">
              <Label>{t("lesson.selectOptional") || "Lesson (Optional)"}</Label>
              <Select value={lessonId || "none"} onValueChange={(value) => setLessonId(value as Id<"lessons"> | "none")}>
                <SelectTrigger>
                  <SelectValue placeholder={t("lesson.noLesson") || "No specific lesson"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("lesson.noLesson") || "No specific lesson"}</SelectItem>
                  {selectedClass?.lessons.map((lesson) => {
                    const isUsed = usedLessonIds?.includes(lesson._id);
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
              <p className="text-xs text-muted-foreground">
                {t("lesson.optionalHelp") || "Leave empty for general class sessions"}
              </p>
            </div>
          )}

          {/* Title (Required if no lesson) */}
          <div className="space-y-2">
            <Label>
              {t("schedule.title") || "Title"}
              {lessonId === "none" && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lessonId !== "none" 
                ? t("schedule.overrideTitle") || "Override lesson title (optional)" 
                : t("schedule.enterTitle") || "e.g., Office Hours, Review Session"}
              required={lessonId === "none"}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("schedule.description") || "Description (Optional)"}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("schedule.descriptionPlaceholder") || "Add additional details..."}
              rows={3}
            />
          </div>

          {/* Date & Time - REPLACED */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("schedule.dateTime") || "Date & Time"}</Label>
              {/* Using DateTimePicker instead of native input for consistency */}
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 {t("schedule.minutes") || "min"}</SelectItem>
                  <SelectItem value="45">45 {t("schedule.minutes") || "min"}</SelectItem>
                  <SelectItem value="60">1 {t("schedule.hour") || "hour"}</SelectItem>
                  <SelectItem value="90">1.5 {t("schedule.hours") || "hours"}</SelectItem>
                  <SelectItem value="120">2 {t("schedule.hours") || "hours"}</SelectItem>
                  <SelectItem value="180">3 {t("schedule.hours") || "hours"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring Toggle */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label>{t("schedule.recurring") || "Recurring Schedule"}</Label>
              <p className="text-sm text-muted-foreground">
                {t("schedule.recurringDescription") || "Create multiple sessions at once"}
              </p>
            </div>
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {/* Recurrence Options */}
          {isRecurring && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("schedule.repeat") || "Repeat"}</Label>
                  <Select value={recurrenceType} onValueChange={(v: "daily" | "weekly" | "biweekly" | "monthly") => setRecurrenceType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">{t("schedule.daily") || "Daily"}</SelectItem>
                      <SelectItem value="weekly">{t("schedule.weekly") || "Weekly"}</SelectItem>
                      <SelectItem value="biweekly">{t("schedule.biweekly") || "Every 2 Weeks"}</SelectItem>
                      <SelectItem value="monthly">{t("schedule.monthly") || "Monthly"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("schedule.occurrences") || "Number of Sessions"}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    value={occurrences}
                    onChange={(e) => setOccurrences(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Days of Week (for weekly/biweekly) */}
              {(recurrenceType === "weekly" || recurrenceType === "biweekly") && (
                <div className="space-y-2">
                  <Label>{t("schedule.daysOfWeek") || "Repeat On (Optional)"}</Label>
                  <div className="flex flex-wrap gap-2">
                    {weekDays.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={daysOfWeek.includes(day.value) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleDayOfWeek(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("schedule.daysHelp") || "Leave empty to repeat on the same day of week"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !classId}>
            {isSubmitting 
              ? t("common.creating") || "Creating..." 
              : isRecurring 
                ? t("schedule.createSessions") || `Create ${occurrences} Sessions`
                : t("common.create") || "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}