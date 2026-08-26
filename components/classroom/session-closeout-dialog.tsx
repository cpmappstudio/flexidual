"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookOpenCheck, Loader2, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionCloseoutSubmission } from "@/lib/session-closeout-policy";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getClassroomQueryNow } from "./use-classroom-clock";

type AttendanceStatus = "present" | "absent" | "partial" | "excused";

interface SessionCloseoutDialogProps {
  open: boolean;
  roomName: string;
  sessionNow: number;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void | Promise<void>;
  alreadyEnded?: boolean;
}

export function SessionCloseoutDialog({
  open,
  roomName,
  sessionNow,
  onOpenChange,
  onComplete,
  alreadyEnded = false,
}: SessionCloseoutDialogProps) {
  const t = useTranslations("classroom.closeout");
  const common = useTranslations("common");
  const context = useQuery(
    api.schedule.getSessionClosureContext,
    open ? { roomName, now: getClassroomQueryNow(sessionNow) } : "skip",
  );
  const submitClosure = useMutation(api.schedule.submitSessionClosure);
  const [selectedLessons, setSelectedLessons] = useState<Set<Id<"lessons">>>(
    new Set(),
  );
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open || !context) return;
    setSelectedLessons(
      new Set(
        context.lessons
          .filter((lesson) => lesson.selected)
          .map((lesson) => lesson.lessonId),
      ),
    );
    setAttendance(
      Object.fromEntries(
        context.attendance.map((student) => [
          student.studentId,
          student.status,
        ]),
      ),
    );
    setError(undefined);
  }, [context, open]);

  const submission = useMemo(
    () =>
      getSessionCloseoutSubmission({
        closureStatus: context?.closureStatus,
        canClose: context?.canClose ?? false,
        selectedLessonCount: selectedLessons.size,
        isAttendanceComplete:
          context?.attendance.every(
            (student) => attendance[student.studentId],
          ) ?? false,
      }),
    [attendance, context, selectedLessons.size],
  );

  const handleSubmit = async () => {
    if (!context || !submission.canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      if (submission.shouldSaveReport) {
        await submitClosure({
          roomName,
          lessonIds: [...selectedLessons],
          attendance: context.attendance.map((student) => ({
            studentId: student.studentId,
            status: attendance[student.studentId],
          })),
        });
      }
      await onComplete();
    } catch (submissionError) {
      console.error("Failed to close the class session:", submissionError);
      setError(t("submitError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="grid max-h-[min(90dvh,56rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>
            {t(alreadyEnded ? "recoveryTitle" : "title")}
          </DialogTitle>
          <DialogDescription>
            {t(alreadyEnded ? "recoveryDescription" : "description")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          <div className="space-y-6 p-6">
            <section className="space-y-3" aria-labelledby="taught-lessons">
              <div className="flex items-start gap-3">
                <BookOpenCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h3 id="taught-lessons" className="font-semibold">
                    {t("lessonsTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("lessonsDescription")}
                  </p>
                </div>
              </div>
              {context === undefined ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              ) : context?.lessons.length ? (
                <div className="grid gap-2">
                  {context.lessons.map((lesson) => (
                    <label
                      key={lesson.lessonId}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedLessons.has(lesson.lessonId)}
                        onCheckedChange={(checked) => {
                          setSelectedLessons((current) => {
                            const next = new Set(current);
                            if (checked) next.add(lesson.lessonId);
                            else next.delete(lesson.lessonId);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm font-medium">
                        {lesson.order}. {lesson.title}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                  {t("noLessons")}
                </p>
              )}
            </section>

            <section
              className="space-y-3"
              aria-labelledby="verified-attendance"
            >
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h3 id="verified-attendance" className="font-semibold">
                    {t("attendanceTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("attendanceDescription")}
                  </p>
                </div>
              </div>
              <div className="divide-y rounded-lg border">
                {context?.attendance.map((student) => (
                  <div
                    key={student.studentId}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {student.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("connectedMinutes", {
                          minutes: student.totalMinutes,
                        })}
                      </p>
                    </div>
                    <Select
                      value={attendance[student.studentId]}
                      onValueChange={(value: AttendanceStatus) =>
                        setAttendance((current) => ({
                          ...current,
                          [student.studentId]: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          ["present", "partial", "excused", "absent"] as const
                        ).map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`status.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t bg-background px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            {common("back")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!submission.canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {t(alreadyEnded ? "recoverySubmit" : "submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
