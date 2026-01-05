"use client"

import { useState, useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { CalendarIcon, Loader2, Clock, Edit } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

// ... (keep formSchema same) ...
const formSchema = z.object({
  date: z.date({ message: "A date is required." }),
  time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format"),
  duration: z.number().min(1, "Duration must be at least 1 minute"),
})

interface ScheduleLessonDialogProps {
  classId: Id<"classes">
  lessonId: Id<"lessons">
  lessonTitle: string
  // NEW PROPS FOR EDITING
  scheduleId?: Id<"classSchedule">
  initialStart?: number
  initialEnd?: number
}

export function ScheduleLessonDialog({ 
  classId, 
  lessonId, 
  lessonTitle,
  scheduleId,
  initialStart,
  initialEnd 
}: ScheduleLessonDialogProps) {
  const [open, setOpen] = useState(false)
  const isEditing = !!scheduleId
  
  const scheduleLesson = useMutation(api.schedule.scheduleLesson)
  const updateSchedule = useMutation(api.schedule.updateSchedule)

  // Calculate default values from timestamps if editing
  const defaultDate = initialStart ? new Date(initialStart) : undefined
  const defaultTime = defaultDate ? format(defaultDate, "HH:mm") : "09:00"
  const defaultDuration = (initialStart && initialEnd) 
    ? Math.round((initialEnd - initialStart) / 1000 / 60) 
    : 60

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: defaultDate,
      time: defaultTime,
      duration: defaultDuration,
    },
  })

  // Reset form when opening dialog with new props
  useEffect(() => {
    if (open && initialStart) {
       const d = new Date(initialStart)
       form.reset({
          date: d,
          time: format(d, "HH:mm"),
          duration: (initialEnd! - initialStart) / 1000 / 60
       })
    }
  }, [open, initialStart, initialEnd, form])


  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const [hours, minutes] = values.time.split(':').map(Number)
      const startDate = new Date(values.date)
      startDate.setHours(hours, minutes)
      
      const startTimestamp = startDate.getTime()
      const endTimestamp = startTimestamp + (values.duration * 60 * 1000)

      if (isEditing && scheduleId) {
        await updateSchedule({
          id: scheduleId,
          scheduledStart: startTimestamp,
          scheduledEnd: endTimestamp,
        })
        toast.success("Schedule updated")
      } else {
        await scheduleLesson({
          classId,
          lessonId,
          scheduledStart: startTimestamp,
          scheduledEnd: endTimestamp,
        })
        toast.success("Lesson scheduled")
      }

      setOpen(false)
      form.reset()
    } catch (error) {
      toast.error("Failed to save schedule")
      console.error(error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <Edit className="h-4 w-4 text-muted-foreground" />
            </Button>
        ) : (
            <Button size="sm" variant="outline">Schedule</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Reschedule" : "Schedule"} &quot;{lessonTitle}&quot;</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             {/* ... (Keep the rest of your JSX exactly the same) ... */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" type="time" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="duration"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Duration (min)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        value={field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Schedule" : "Confirm Schedule"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}