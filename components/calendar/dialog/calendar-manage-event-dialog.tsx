"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Video } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import Link from "next/link";

const formSchema = z
  .object({
    start: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid start date",
    }),
    end: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid end date",
    }),
  })
  .refine(
    (data) => {
      try {
        const start = new Date(data.start);
        const end = new Date(data.end);
        return end >= start;
      } catch {
        return false;
      }
    },
    {
      message: "End time must be after start time",
      path: ["end"],
    },
  );

type FormValues = z.infer<typeof formSchema>;

export default function CalendarManageEventDialog() {
  const {
    manageEventDialogOpen,
    setManageEventDialogOpen,
    selectedEvent,
    setSelectedEvent,
  } = useCalendarContext();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Convex mutations
  const updateSchedule = useMutation(api.schedule.updateSchedule);
  const cancelSchedule = useMutation(api.schedule.cancelSchedule);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      start: "",
      end: "",
    },
  });

  useEffect(() => {
    if (selectedEvent) {
      form.reset({
        start: selectedEvent.start.toISOString(),
        end: selectedEvent.end.toISOString(),
      });
    }
  }, [selectedEvent, form]);

  async function onSubmit(values: FormValues) {
    if (!selectedEvent?.scheduleId) {
      toast.error("Event not found");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateSchedule({
        id: selectedEvent.scheduleId,
        scheduledStart: new Date(values.start).getTime(),
        scheduledEnd: new Date(values.end).getTime(),
      });

      toast.success("Event updated successfully!");
      handleClose();
    } catch (error) {
      console.error("Failed to update event:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update event"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selectedEvent?.scheduleId) {
      toast.error("Event not found");
      return;
    }

    setIsDeleting(true);

    try {
      await cancelSchedule({
        id: selectedEvent.scheduleId,
      });

      toast.success("Event cancelled successfully!");
      handleClose();
    } catch (error) {
      console.error("Failed to cancel event:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel event"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleClose() {
    setManageEventDialogOpen(false);
    setSelectedEvent(null);
    form.reset();
  }

  const statusBadge = selectedEvent ? (
    <Badge
      variant={
        selectedEvent.status === "active" ? "default" :
        selectedEvent.status === "completed" ? "secondary" :
        selectedEvent.status === "cancelled" ? "destructive" :
        "outline"
      }
    >
      {selectedEvent.status?.toUpperCase()}
    </Badge>
  ) : null;

  return (
    <Dialog open={manageEventDialogOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Scheduled Lesson</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Lesson Info (Read-only) */}
            {selectedEvent && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium border-b pb-2">
                  Lesson Information
                </h4>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Curriculum:</span>
                    <span className="font-medium">
                      {selectedEvent.curriculumTitle}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lesson:</span>
                    <span className="font-medium">
                      {selectedEvent.title}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Class:</span>
                    <span className="font-medium">
                      {selectedEvent.className}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status:</span>
                    {statusBadge}
                  </div>
                  {selectedEvent.isLive && (
                    <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                          <Video className="h-4 w-4" />
                          <span className="font-medium">Live Now</span>
                        </div>
                        <Link href={`/classroom/${selectedEvent.roomName}`}>
                          <Button size="sm" variant="default">
                            Join Class
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-2">
                Schedule
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start"
                  render={({ field }) => (
                    <FormItem className="grid gap-3">
                      <Label>Start Time</Label>
                      <FormControl>
                        <DateTimePicker field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end"
                  render={({ field }) => (
                    <FormItem className="grid gap-3">
                      <Label>End Time</Label>
                      <FormControl>
                        <DateTimePicker field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="flex justify-between gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" type="button" disabled={isDeleting || selectedEvent?.status === "cancelled"}>
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Cancel Lesson
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this lesson?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the lesson as cancelled. Students will not be able to join.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Lesson</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                      Cancel Lesson
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="submit" disabled={isSubmitting || selectedEvent?.status === "cancelled"}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Update Schedule"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}