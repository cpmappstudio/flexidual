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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCalendarContext } from "../calendar-context";
import { DateTimePicker } from "@/components/calendar/form/date-time-picker";
import { ColorPicker } from "@/components/calendar/form/color-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Trash2, X, Loader2, FileCheck } from "lucide-react";
import { toast } from "sonner";

const formSchema = z
  .object({
    start: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid start date",
    }),
    end: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid end date",
    }),
    color: z.string(),
    standards: z.array(z.string()).min(1, "At least one standard is required"),
    objectives: z.string().optional(),
    additionalInfo: z.string().optional(),
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

  // State for standards management
  const [standards, setStandards] = useState<string[]>([]);
  const [standardInput, setStandardInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Convex mutations
  const updateScheduledLesson = useMutation(api.lessons.updateScheduledLesson);
  const deleteScheduledLesson = useMutation(api.lessons.deleteScheduledLesson);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      start: "",
      end: "",
      color: "blue",
      standards: [],
      objectives: "",
      additionalInfo: "",
    },
  });

  useEffect(() => {
    if (selectedEvent) {
      const eventStandards = selectedEvent.standards || [];
      form.reset({
        start: selectedEvent.start.toISOString(),
        end: selectedEvent.end.toISOString(),
        color: selectedEvent.color,
        standards: eventStandards,
        objectives: selectedEvent.objectives || "",
        additionalInfo: selectedEvent.additionalInfo || "",
      });
      setStandards(eventStandards);
    }
  }, [selectedEvent, form]);

  async function onSubmit(values: FormValues) {
    if (!selectedEvent?._id) {
      toast.error("Event not found");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateScheduledLesson({
        progressId: selectedEvent._id as Id<"lesson_progress">,
        scheduledStart: new Date(values.start).getTime(),
        scheduledEnd: new Date(values.end).getTime(),
        standards: values.standards,
        lessonPlan: values.objectives,
        notes: values.additionalInfo,
        displayColor: values.color,
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
    if (!selectedEvent?._id) {
      toast.error("Event not found");
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteScheduledLesson({
        progressId: selectedEvent._id as Id<"lesson_progress">,
      });

      if (result.deleted) {
        toast.success("Event deleted successfully!");
      } else {
        // Event had evidence, only scheduling was removed
        toast.success("Event removed from calendar. Evidence preserved.");
      }

      handleClose();
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete event"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  function handleClose() {
    setManageEventDialogOpen(false);
    setSelectedEvent(null);
    form.reset();
    setStandards([]);
    setStandardInput("");
  }

  const handleAddStandard = () => {
    const trimmedInput = standardInput.trim();
    if (trimmedInput && !standards.includes(trimmedInput)) {
      const newStandards = [...standards, trimmedInput];
      setStandards(newStandards);
      form.setValue("standards", newStandards);
      setStandardInput("");
    }
  };

  const handleRemoveStandard = (standardToRemove: string) => {
    const newStandards = standards.filter((s) => s !== standardToRemove);
    setStandards(newStandards);
    form.setValue("standards", newStandards);
  };

  const handleStandardKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddStandard();
    }
  };

  const hasEvidence = selectedEvent?.hasEvidence;

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
                    <span className="text-muted-foreground">Course:</span>
                    <span className="font-medium">
                      {selectedEvent.curriculumName || "N/A"}
                      {selectedEvent.curriculumCode && (
                        <Badge variant="outline" className="ml-2">
                          {selectedEvent.curriculumCode}
                        </Badge>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lesson:</span>
                    <span className="font-medium">
                      {selectedEvent.lessonTitle || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grade:</span>
                    <span className="font-medium">
                      {selectedEvent.gradeName || selectedEvent.gradeCode || "N/A"}
                    </span>
                  </div>
                  {selectedEvent.groupCode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Group:</span>
                      <span className="font-medium">{selectedEvent.groupCode}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge
                      variant={
                        selectedEvent.status === "completed"
                          ? "default"
                          : "secondary"
                      }
                      className={
                        selectedEvent.status === "completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                          : ""
                      }
                    >
                      {selectedEvent.status === "completed" && (
                        <FileCheck className="h-3 w-3 mr-1" />
                      )}
                      {selectedEvent.status?.replace("_", " ") || "not started"}
                    </Badge>
                  </div>
                  {hasEvidence && (
                    <div className="bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 p-2 rounded-md text-xs">
                      ✓ This lesson has evidence uploaded. Deleting will only remove it from the calendar.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Objectives */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-2">Objectives</h4>
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="objectives"
                  render={({ field }) => (
                    <FormItem className="grid gap-3">
                      <FormControl>
                        <Textarea
                          className="resize-none min-h-[80px]"
                          placeholder="Enter objectives for this lesson..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Standards Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-2">
                Standards <span className="text-red-500">*</span>
              </h4>
              <div className="grid gap-4">
                <div className="grid gap-3">
                  <Label htmlFor="standardCode">
                    Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="standardCode"
                    placeholder="e.g., ELA.12.R.3.2"
                    value={standardInput}
                    onChange={(e) => setStandardInput(e.target.value)}
                    onKeyDown={handleStandardKeyDown}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 w-fit"
                  onClick={handleAddStandard}
                  disabled={!standardInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                  Add Standard
                </Button>

                {/* Standards Badges */}
                {standards.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {standards.map((standard) => (
                      <Badge
                        key={standard}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {standard}
                        <button
                          type="button"
                          onClick={() => handleRemoveStandard(standard)}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                          aria-label={`Remove ${standard}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-2">
                Additional Information
              </h4>
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="additionalInfo"
                  render={({ field }) => (
                    <FormItem className="grid gap-3">
                      <FormControl>
                        <Textarea
                          className="resize-none min-h-[80px]"
                          placeholder="Enter any additional notes or information..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-2">
                Schedule <span className="text-red-500">*</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start"
                  render={({ field }) => (
                    <FormItem className="grid gap-3">
                      <Label>
                        Start <span className="text-red-500">*</span>
                      </Label>
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
                      <Label>
                        End <span className="text-red-500">*</span>
                      </Label>
                      <FormControl>
                        <DateTimePicker field={field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Color */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium border-b pb-2">
                Customization
              </h4>
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem className="grid gap-3">
                    <Label>Color</Label>
                    <FormControl>
                      <ColorPicker field={field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="flex justify-between gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" type="button" disabled={isDeleting}>
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {hasEvidence ? "Remove from calendar" : "Delete"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {hasEvidence ? "Remove from calendar" : "Delete event"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {hasEvidence
                        ? "This lesson has evidence uploaded. The event will be removed from the calendar, but the evidence will be preserved in the teaching section."
                        : "Are you sure you want to delete this event? This action cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button variant="destructive" onClick={handleDelete}>
                      {hasEvidence ? "Remove" : "Delete"}
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Update event
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
