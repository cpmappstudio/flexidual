"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Search,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AttendanceStatusControl,
  type AttendanceStatus,
} from "@/components/attendance/attendance-status-control";
import { Button } from "@/components/ui/button";
import {
  ClassSessionTabsList,
  ClassSessionTabsTrigger,
} from "@/components/classroom/class-session-tabs";
import { SessionLessonPicker } from "@/components/classroom/session-lesson-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionCloseoutSubmission } from "@/lib/session-closeout-policy";

interface SessionCloseoutDialogProps {
  open: boolean;
  roomName: string;
  sessionNow: number;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void | Promise<void>;
  onReopen?: () => void | Promise<void>;
  isReopening?: boolean;
  alreadyEnded?: boolean;
  required?: boolean;
}

type CloseoutStep = "lessons" | "attendance";
type SessionClosureContext = FunctionReturnType<
  typeof api.schedule.getSessionClosureContext
>;
type SessionClosureSnapshot =
  | { status: "idle" }
  | { status: "loading"; roomName: string; now: number }
  | {
      status: "ready";
      roomName: string;
      context: SessionClosureContext;
    };

const ATTENDANCE_PRIORITY = {
  partial: 0,
  absent: 1,
  present: 2,
} as const;

export function SessionCloseoutDialog({
  open,
  roomName,
  sessionNow,
  onOpenChange,
  onComplete,
  onReopen,
  isReopening = false,
  alreadyEnded = false,
  required = false,
}: SessionCloseoutDialogProps) {
  const t = useTranslations("classroom.closeout");
  const classroomT = useTranslations("classroom");
  const attendanceT = useTranslations("attendance");
  const common = useTranslations("common");
  const sessionNowRef = useRef(sessionNow);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<SessionClosureSnapshot>({
    status: "idle",
  });
  const requestedContext = useQuery(
    api.schedule.getSessionClosureContext,
    snapshot.status === "loading"
      ? { roomName: snapshot.roomName, now: snapshot.now }
      : "skip",
  );
  const submitClosure = useMutation(api.schedule.submitSessionClosure);
  const context = snapshot.status === "ready" ? snapshot.context : undefined;
  const [activeStep, setActiveStep] = useState<CloseoutStep>("lessons");
  const [attendanceQuery, setAttendanceQuery] = useState("");
  const [selectedLessons, setSelectedLessons] = useState<Set<Id<"lessons">>>(
    new Set(),
  );
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [excuseReasons, setExcuseReasons] = useState<Record<string, string>>(
    {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReportSaved, setIsReportSaved] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    sessionNowRef.current = sessionNow;
  }, [sessionNow]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Opening a closure captures the current wall clock once; subsequent clock ticks must not reset unsaved attendance/notes.
    setActiveStep("lessons");
    setAttendanceQuery("");
    setSelectedLessons(new Set());
    setAttendance({});
    setExcuseReasons({});
    setNotes("");
    setError(undefined);
    setIsReportSaved(false);
    setSnapshot(
      open
        ? {
            status: "loading",
            roomName,
            now: Math.max(sessionNowRef.current, Date.now()),
          }
        : { status: "idle" },
    );
  }, [open, roomName]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) viewport.scrollTop = 0;
  }, [activeStep]);

  useEffect(() => {
    if (
      !open ||
      snapshot.status !== "loading" ||
      snapshot.roomName !== roomName ||
      requestedContext === undefined
    ) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Freeze one authorized remote context before editing; later reactive updates must not overwrite this report draft.
    setSnapshot({
      status: "ready",
      roomName: snapshot.roomName,
      context: requestedContext,
    });
    if (!requestedContext) return;
    setSelectedLessons(
      new Set(
        requestedContext.lessons
          .filter((lesson) => lesson.selected)
          .map((lesson) => lesson.lessonId),
      ),
    );
    setAttendance(
      Object.fromEntries(
        requestedContext.attendance.map((student) => [
          student.studentId,
          student.status,
        ]),
      ),
    );
    setExcuseReasons(
      Object.fromEntries(
        requestedContext.attendance.map((student) => [
          student.studentId,
          student.excuseReason ?? "",
        ]),
      ),
    );
    setNotes(requestedContext.notes ?? "");
  }, [open, requestedContext, roomName, snapshot]);

  const sortedAttendance = useMemo(
    () =>
      [...(context?.attendance ?? [])].sort(
        (firstStudent, secondStudent) =>
          ATTENDANCE_PRIORITY[firstStudent.suggestedStatus] -
            ATTENDANCE_PRIORITY[secondStudent.suggestedStatus] ||
          firstStudent.fullName.localeCompare(secondStudent.fullName),
      ),
    [context?.attendance],
  );

  const filteredAttendance = useMemo(() => {
    const normalizedQuery = attendanceQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return sortedAttendance;
    return sortedAttendance.filter((student) =>
      student.fullName.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [attendanceQuery, sortedAttendance]);

  const submission = useMemo(
    () =>
      getSessionCloseoutSubmission({
        closureStatus: isReportSaved ? "completed" : context?.closureStatus,
        canClose: context?.canClose ?? false,
        isAttendanceComplete:
          context?.attendance.every(
            (student) =>
              attendance[student.studentId] &&
              (attendance[student.studentId] !== "excused" ||
                excuseReasons[student.studentId]?.trim()),
          ) ?? false,
      }),
    [attendance, context, excuseReasons, isReportSaved],
  );

  const attendanceLabels = {
    present: attendanceT("status.present"),
    partial: attendanceT("status.partial"),
    absent: attendanceT("status.absent"),
    excused: attendanceT("status.excused"),
  };
  const attendanceDescriptions = {
    present: attendanceT("description.present"),
    partial: attendanceT("description.partial"),
    absent: attendanceT("description.absent"),
    excused: attendanceT("description.excused"),
  };

  const handleSubmit = async () => {
    if (!context || !submission.canSubmit || isSubmitting || isReopening)
      return;
    setIsSubmitting(true);
    setError(undefined);
    try {
      if (submission.shouldSaveReport) {
        await submitClosure({
          roomName,
          lessonIds: [...selectedLessons],
          notes: notes.trim() || undefined,
          attendance: context.attendance.map((student) => ({
            studentId: student.studentId,
            status: attendance[student.studentId],
            excuseReason:
              attendance[student.studentId] === "excused"
                ? excuseReasons[student.studentId]
                : undefined,
          })),
        });
        setIsReportSaved(true);
      }
      await onComplete();
    } catch (submissionError) {
      console.error("Failed to close the class session:", submissionError);
      setError(t("submitError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (isSubmitting || isReopening || required)) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={!required}
        className="grid max-h-[min(90dvh,56rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <Tabs
          value={activeStep}
          onValueChange={(value) => setActiveStep(value as CloseoutStep)}
          className="contents"
        >
          <DialogHeader className="border-b px-6 pt-5">
            <DialogTitle>
              {t(alreadyEnded ? "recoveryTitle" : "title")}
            </DialogTitle>
            <DialogDescription>
              {t(alreadyEnded ? "recoveryDescription" : "description")}
            </DialogDescription>
            <ClassSessionTabsList className="mt-3">
              <ClassSessionTabsTrigger value="lessons">
                {t("lessonsStep")}
              </ClassSessionTabsTrigger>
              <ClassSessionTabsTrigger value="attendance">
                {t("attendanceStep")}
              </ClassSessionTabsTrigger>
            </ClassSessionTabsList>
          </DialogHeader>

          <ScrollArea ref={scrollAreaRef} className="min-h-0">
            <TabsContent
              value="lessons"
              forceMount
              hidden={activeStep !== "lessons"}
              className="m-0 space-y-5 p-6"
            >
              <section className="space-y-3" aria-labelledby="session-notes">
                <div className="flex items-start gap-3">
                  <MessageSquareText className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 id="session-notes" className="font-semibold">
                      {t("notesTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("notesDescription")}
                    </p>
                  </div>
                </div>
                <Textarea
                  aria-labelledby="session-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("notesPlaceholder")}
                  rows={3}
                />
              </section>
              <SessionLessonPicker
                key={`${roomName}:${open}`}
                lessons={context?.lessons}
                selectedLessons={selectedLessons}
                onSelectedLessonsChange={setSelectedLessons}
              />
            </TabsContent>

            <TabsContent value="attendance" className="m-0 space-y-6 p-6">
              <section
                className="space-y-4"
                aria-labelledby="verified-attendance"
              >
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 id="verified-attendance" className="font-semibold">
                      {t("attendanceTitle")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("saveConfirmation")}
                    </p>
                  </div>
                </div>

                <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      value={attendanceQuery}
                      onChange={(event) =>
                        setAttendanceQuery(event.target.value)
                      }
                      placeholder={t("searchStudents")}
                      className="pl-9"
                    />
                  </div>
                </div>

                {context === undefined ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : filteredAttendance.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {t("noMatchingStudents")}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border">
                    {filteredAttendance.map((student) => (
                      <div
                        key={student.studentId}
                        className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
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
                          <p className="text-xs text-muted-foreground">
                            {t("suggestedStatus", {
                              status: attendanceLabels[student.suggestedStatus],
                            })}
                          </p>
                        </div>
                        <AttendanceStatusControl
                          status={
                            attendance[student.studentId] ??
                            student.suggestedStatus
                          }
                          excuseReason={excuseReasons[student.studentId]}
                          labels={attendanceLabels}
                          descriptions={attendanceDescriptions}
                          ariaLabel={attendanceT("controlLabel", {
                            name: student.fullName,
                          })}
                          reasonLabel={t("excuseReason")}
                          reasonPlaceholder={t("excuseReasonPlaceholder")}
                          className="w-full sm:w-64"
                          onStatusChange={(value) =>
                            setAttendance((current) => ({
                              ...current,
                              [student.studentId]: value,
                            }))
                          }
                          onExcuseReasonChange={(reason) =>
                            setExcuseReasons((current) => ({
                              ...current,
                              [student.studentId]: reason,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {error && (
                <p
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {error}
                </p>
              )}
            </TabsContent>
          </ScrollArea>

          <DialogFooter className="flex-col gap-3 border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            {onReopen && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting || isReopening}
                onClick={() => void onReopen()}
              >
                {isReopening && <Loader2 className="size-4 animate-spin" />}
                {classroomT("reopenClass")}
              </Button>
            )}
            <div className="flex w-full gap-2 sm:w-auto">
              {(!required || activeStep === "attendance") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting || isReopening}
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    if (activeStep === "attendance") setActiveStep("lessons");
                    else onOpenChange(false);
                  }}
                >
                  {activeStep === "attendance" && (
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  )}
                  {activeStep === "attendance"
                    ? t("backToLessons")
                    : common("cancel")}
                </Button>
              )}
              {activeStep === "lessons" ? (
                <Button
                  type="button"
                  className="flex-1 sm:flex-none"
                  onClick={() => setActiveStep("attendance")}
                >
                  {t("continueToAttendance")}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1 sm:flex-none"
                  disabled={
                    !submission.canSubmit || isSubmitting || isReopening
                  }
                  onClick={() => void handleSubmit()}
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {t(alreadyEnded ? "recoverySubmit" : "submit")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
