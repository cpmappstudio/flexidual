"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquareText,
  Search,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  AttendanceStatusControl,
  type AttendanceStatus,
} from "@/components/attendance/attendance-status-control";
import { LESSON_STATUS_STYLES } from "@/components/teaching/classes/lesson-status-styles";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSessionCloseoutSubmission } from "@/lib/session-closeout-policy";
import { cn } from "@/lib/utils";

interface SessionCloseoutDialogProps {
  open: boolean;
  roomName: string;
  sessionNow: number;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void | Promise<void>;
  alreadyEnded?: boolean;
}

type CloseoutStep = "lessons" | "attendance";
type LessonFilter = "pending" | "taught" | "all";
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
  alreadyEnded = false,
}: SessionCloseoutDialogProps) {
  const t = useTranslations("classroom.closeout");
  const attendanceT = useTranslations("attendance");
  const classT = useTranslations("class");
  const common = useTranslations("common");
  const format = useFormatter();
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
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>("pending");
  const [lessonQuery, setLessonQuery] = useState("");
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
    setActiveStep("lessons");
    setLessonFilter("pending");
    setLessonQuery("");
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

  const lessonCounts = useMemo(() => {
    const total = context?.lessons.length ?? 0;
    const taught =
      context?.lessons.filter((lesson) => lesson.previousSessionCount > 0)
        .length ?? 0;
    return { total, taught, pending: total - taught };
  }, [context?.lessons]);

  const filteredLessons = useMemo(() => {
    const normalizedQuery = lessonQuery.trim().toLocaleLowerCase();
    return (context?.lessons ?? []).filter((lesson) => {
      const status = lesson.previousSessionCount > 0 ? "taught" : "pending";
      const matchesStatus = lessonFilter === "all" || lessonFilter === status;
      const matchesQuery =
        !normalizedQuery ||
        lesson.title.toLocaleLowerCase().includes(normalizedQuery) ||
        String(lesson.order).includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [context?.lessons, lessonFilter, lessonQuery]);

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
    if (!context || !submission.canSubmit || isSubmitting) return;
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
    if (!nextOpen && isSubmitting) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
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
            <TabsList className="mt-3 grid h-11 w-full grid-cols-2 rounded-none bg-transparent p-0">
              <TabsTrigger
                value="lessons"
                className="h-11 rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {t("lessonsStep")}
              </TabsTrigger>
              <TabsTrigger
                value="attendance"
                className="h-11 rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {t("attendanceStep")}
              </TabsTrigger>
            </TabsList>
          </DialogHeader>

          <ScrollArea ref={scrollAreaRef} className="min-h-0">
            <TabsContent value="lessons" className="m-0 space-y-5 p-6">
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
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("notesPlaceholder")}
                  rows={3}
                />
              </section>
              <section className="space-y-4" aria-labelledby="taught-lessons">
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

                <div className="sticky top-0 z-10 -mx-1 grid gap-3 bg-background/95 px-1 py-2 backdrop-blur lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      value={lessonQuery}
                      onChange={(event) => setLessonQuery(event.target.value)}
                      placeholder={t("searchLessons")}
                      className="pl-9"
                    />
                  </div>
                  <ToggleGroup
                    type="single"
                    value={lessonFilter}
                    variant="outline"
                    size="sm"
                    aria-label={t("filterLabel")}
                    className="grid grid-cols-3"
                    onValueChange={(value) => {
                      if (value) setLessonFilter(value as LessonFilter);
                    }}
                  >
                    {(
                      [
                        ["pending", lessonCounts.pending],
                        ["taught", lessonCounts.taught],
                        ["all", lessonCounts.total],
                      ] as const
                    ).map(([filter, count]) => (
                      <ToggleGroupItem
                        key={filter}
                        value={filter}
                        className="group h-9 min-w-0 px-3"
                      >
                        <span className="truncate">
                          {t(`filter.${filter}`)}
                        </span>
                        <span className="tabular-nums text-muted-foreground group-data-[state=on]:text-accent-foreground/70">
                          {count}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                {context === undefined ? (
                  <div className="flex h-24 items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : context?.lessons.length === 0 ? (
                  <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                    {t("noLessons")}
                  </p>
                ) : filteredLessons.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {t("noMatchingLessons")}
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {filteredLessons.map((lesson) => {
                      const status =
                        lesson.previousSessionCount > 0 ? "taught" : "pending";
                      const isSelected = selectedLessons.has(lesson.lessonId);
                      const history = lesson.lastRecordedAt
                        ? t("previouslyRecordedDetails", {
                            count: lesson.previousSessionCount,
                            date: format.dateTime(lesson.lastRecordedAt, {
                              dateStyle: "medium",
                            }),
                          })
                        : undefined;
                      return (
                        <label
                          key={lesson.lessonId}
                          className={cn(
                            "grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border p-3 transition-colors",
                            isSelected
                              ? "border-success/50 bg-success/5"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedLessons((current) => {
                                const next = new Set(current);
                                if (checked) next.add(lesson.lessonId);
                                else next.delete(lesson.lessonId);
                                return next;
                              });
                            }}
                          />
                          <span
                            className={cn(
                              "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                              LESSON_STATUS_STYLES[status].indicator,
                            )}
                          >
                            {lesson.order}
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-2 break-words text-sm font-medium leading-snug">
                              {lesson.title}
                            </span>
                            <span
                              className={cn(
                                "mt-1 block text-xs",
                                LESSON_STATUS_STYLES[status].label,
                              )}
                            >
                              {status === "taught"
                                ? [classT("lessonTaught"), history]
                                    .filter(Boolean)
                                    .join(" · ")
                                : classT("lessonPending")}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
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
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
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
                  disabled={!submission.canSubmit || isSubmitting}
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
