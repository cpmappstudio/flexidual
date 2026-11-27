"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, Info } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  areQuizQuestionsValid,
  isAutomaticQuizQuestion,
  isValidQuizDuration,
  getQuizQuestionIssue,
} from "@/lib/course-quizzes";
import { localDateTimeToUtc, utcToLocalDateTime } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import { TaskContentFields, TaskDateFields } from "./course-task-fields";
import {
  QuizAttemptSummary,
  QuizDurationField,
  QuizShuffleField,
} from "./course-quiz-attempt-fields";
import {
  CourseQuizQuestionsEditor,
  quizQuestionToDraft,
  type QuizQuestionDraft,
} from "./course-quiz-questions-editor";

export function CourseQuizEditor({
  classId,
  task,
  timeZone,
  onClose,
  onSaved,
}: {
  classId: Id<"classes">;
  task?: Doc<"courseTasks">;
  timeZone: string;
  onClose: () => void;
  onSaved: (id: Id<"courseTasks">) => void;
}) {
  const t = useTranslations("courseQuizzes");
  const taskT = useTranslations("courseTasks");
  const gradingT = useTranslations("grading");
  const policy = useQuery(api.academicSettings.getGradingForCourse, {
    classId,
  });
  const editSnapshot = useQuery(
    api.courseQuizzes.getForEditing,
    task ? { taskId: task._id } : "skip",
  );
  const liveTask = editSnapshot?.task;
  const loading = !!task && !editSnapshot;
  const currentTask = liveTask ?? task;
  const create = useMutation(api.courseQuizzes.create);
  const update = useMutation(api.courseTasks.update);
  const [baseline, setBaseline] = useState<Doc<"courseTasks">>();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [availableAt, setAvailableAt] = useState(
    task?.availableAt ? utcToLocalDateTime(task.availableAt, timeZone) : "",
  );
  const [dueAt, setDueAt] = useState(
    task?.dueAt ? utcToLocalDateTime(task.dueAt, timeZone) : "",
  );
  const [duration, setDuration] = useState(
    String(task?.quiz?.durationMinutes ?? 10),
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    task?.quiz?.shuffleQuestions ?? false,
  );
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([]);
  const [baselineQuestions, setBaselineQuestions] = useState<
    QuizQuestionDraft[] | null
  >(null);
  const editingQuestions = !task || baselineQuestions !== null;
  const questionsLocked = !!task && editSnapshot?.questions === null;
  const questionsChanged =
    !!task &&
    baselineQuestions !== null &&
    JSON.stringify(questions) !== JSON.stringify(baselineQuestions);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState<string>();
  const [errorTarget, setErrorTarget] = useState<string>();
  const [validationAttempt, setValidationAttempt] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const attemptStarted = currentTask?.quiz?.firstStartedAt !== undefined;
  const closingLocked = currentTask?.quiz?.closedAt !== undefined;
  const decimalPlaces =
    currentTask?.grading?.decimalPlaces ?? policy?.decimalPlaces ?? 2;
  const disabled = saving || (!!task && !liveTask);
  const editReady = !!task && !!baseline;
  const payload = questions.map((question) => {
    const common = {
      ...(question._id !== undefined && { _id: question._id }),
      prompt: question.prompt.trim(),
      maxPoints: Number(question.maxPoints),
    };
    if (question.kind === "text") return { ...common, kind: question.kind };
    const choice = {
      ...common,
      options: question.options.map((option) => ({
        ...option,
        label: option.label.trim(),
      })),
    };
    return question.kind === "single_choice"
      ? {
          ...choice,
          kind: question.kind,
          correctOptionId: question.correctOptionId,
        }
      : {
          ...choice,
          kind: question.kind,
          correctOptionIds: question.correctOptionIds,
        };
  });
  const validQuestions = areQuizQuestionsValid(payload, decimalPlaces);
  const issues = payload.map((question) =>
    validationAttempt
      ? getQuizQuestionIssue(question, decimalPlaces)
      : undefined,
  );

  function loadSnapshot(
    snapshot: FunctionReturnType<typeof api.courseQuizzes.getForEditing>,
  ) {
    const latest = snapshot.task;
    const drafts = snapshot.questions?.map(quizQuestionToDraft) ?? null;
    setBaseline(latest);
    setTitle(latest.title);
    setDescription(latest.description ?? "");
    setAvailableAt(
      latest.availableAt !== undefined
        ? utcToLocalDateTime(latest.availableAt, timeZone)
        : "",
    );
    setDueAt(
      latest.dueAt !== undefined
        ? utcToLocalDateTime(latest.dueAt, timeZone)
        : "",
    );
    setDuration(String(latest.quiz!.durationMinutes));
    setShuffleQuestions(latest.quiz?.shuffleQuestions ?? false);
    setQuestions(drafts ?? []);
    setBaselineQuestions(drafts);
    setDirty(false);
    setFormError(undefined);
    setErrorTarget(undefined);
    setValidationAttempt(0);
  }

  if (task && editSnapshot && baseline?._id !== task._id) {
    loadSnapshot(editSnapshot);
  }

  function showError(message: string, target?: string) {
    setFormError(message);
    setErrorTarget(target);
  }

  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError, validationAttempt]);

  useEffect(() => {
    if (editReady) document.getElementById("task-title")?.focus();
  }, [editReady]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function close() {
    if (savingRef.current || confirmingLeave) return;
    if (dirty) setConfirmingLeave(true);
    else onClose();
  }

  function saveError(error: unknown) {
    const code =
      error instanceof ConvexError && typeof error.data === "string"
        ? error.data
        : "";
    if (code === "QUIZ_DURATION_LOCKED") return t("durationLocked");
    if (code === "QUIZ_SHUFFLE_LOCKED") return t("shuffleLocked");
    if (code === "QUIZ_SETTINGS_CHANGED") return t("settingsChanged");
    if (code === "QUIZ_QUESTIONS_LOCKED") return t("questionsLocked");
    if (code === "QUIZ_CLOSED") return t("closingLocked");
    if (code === "TASK_ALREADY_RELEASED") return t("startLocked");
    if (code === "INVALID_TASK_DATES") return t("invalidDates");
    if (code === "TASK_RELEASE_FAILED") return t("releaseError");
    if (code === "INVALID_QUIZ_QUESTIONS") return t("invalidQuestions");
    if (code === "INVALID_QUIZ_DURATION") return t("invalidDuration");
    if (code === "COURSE_CLOSED") return t("courseUnavailable");
    return t("saveError");
  }

  async function save(form: HTMLFormElement) {
    if (savingRef.current || disabled || (!task && !policy)) return;
    setFormError(undefined);
    setErrorTarget(undefined);
    setValidationAttempt((attempt) => attempt + 1);
    if (questionsChanged && questionsLocked) {
      showError(t("questionsLocked"));
      return;
    }
    if (baseline && currentTask?.updatedAt !== baseline.updatedAt) {
      setFormError(t("settingsChanged"));
      return;
    }
    if (!title.trim()) {
      showError(t("titleRequired"), "task-title");
      return;
    }
    if (editingQuestions && !questionsLocked && !validQuestions) {
      if (questions.length === 0) {
        showError(t("questionsRequired"), "quiz-add-question");
        return;
      }
      const index = payload.findIndex((question) =>
        getQuizQuestionIssue(question, decimalPlaces),
      );
      const issue =
        index >= 0
          ? getQuizQuestionIssue(payload[index], decimalPlaces)
          : undefined;
      if (issue) {
        const target =
          issue.field === "option"
            ? issue.optionId
            : `${questions[index].id}-${issue.field}`;
        showError(
          t("questionError", {
            number: index + 1,
            message: t(issue.message, { decimalPlaces }),
          }),
          target,
        );
      } else showError(t("invalidQuestions"));
      return;
    }
    const durationMinutes = attemptStarted
      ? currentTask!.quiz!.durationMinutes
      : Number(duration);
    if (
      !isValidQuizDuration(durationMinutes) ||
      (!attemptStarted && !/^[0-9]+$/.test(duration))
    ) {
      showError(t("invalidDuration"), "quiz-duration");
      return;
    }
    let start: number | undefined;
    let deadline: number;
    let dateTarget = "task-start";
    try {
      if (
        form.querySelector<HTMLInputElement>("#task-start")?.validity.badInput
      )
        throw new Error("INVALID_START");
      start =
        baseline?.availableAt !== undefined &&
        availableAt === utcToLocalDateTime(baseline.availableAt, timeZone)
          ? baseline.availableAt
          : availableAt
            ? localDateTimeToUtc(availableAt, timeZone)
            : undefined;
      dateTarget = "task-due";
      if (!dueAt) throw new Error("MISSING_DEADLINE");
      deadline = closingLocked
        ? currentTask!.dueAt!
        : baseline?.dueAt !== undefined &&
            dueAt === utcToLocalDateTime(baseline.dueAt, timeZone)
          ? baseline.dueAt
          : localDateTimeToUtc(dueAt, timeZone);
      const effectiveStart = currentTask?.releasedAt ?? start;
      if (effectiveStart !== undefined && deadline <= effectiveStart)
        throw new Error("INVALID_DATES");
    } catch {
      showError(t("invalidDates"), dateTarget);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      let id: Id<"courseTasks">;
      if (task && baseline) {
        const changes = {
          ...(questionsChanged && { questions: payload }),
          ...(title.trim() !== baseline.title && { title: title.trim() }),
          ...(description.trim() !== (baseline.description ?? "") && {
            description: description.trim() || null,
          }),
          ...(currentTask?.releasedAt === undefined &&
            start !== baseline.availableAt && { availableAt: start ?? null }),
          ...(!closingLocked &&
            deadline !== baseline.dueAt && { dueAt: deadline }),
          ...(!attemptStarted &&
            durationMinutes !== baseline.quiz?.durationMinutes && {
              durationMinutes,
            }),
          ...(!attemptStarted &&
            shuffleQuestions !== (baseline.quiz?.shuffleQuestions ?? false) && {
              shuffleQuestions,
            }),
        };
        if (Object.keys(changes).length)
          await update({
            taskId: task._id,
            expectedUpdatedAt: baseline.updatedAt,
            ...changes,
          });
        id = task._id;
      } else {
        id = await create({
          classId,
          title: title.trim(),
          description: description.trim() || undefined,
          availableAt: start,
          dueAt: deadline,
          durationMinutes,
          shuffleQuestions,
          questions: payload,
        });
      }
      setDirty(false);
      toast.success(
        t(task ? "updated" : start !== undefined ? "scheduled" : "created"),
      );
      onSaved(id);
    } catch (error) {
      setFormError(saveError(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const shuffleControl = (
    <QuizShuffleField
      checked={shuffleQuestions}
      onChange={(checked) => {
        setShuffleQuestions(checked);
        setDirty(true);
      }}
      disabled={disabled}
    />
  );
  const durationControl = (
    <QuizDurationField
      value={duration}
      onChange={(value) => {
        setDuration(value);
        setDirty(true);
      }}
      disabled={disabled}
      error={errorTarget === "quiz-duration" ? formError : undefined}
    />
  );

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[90dvh] min-w-0 flex-col gap-0 overflow-clip p-0 sm:max-w-2xl",
            task && "[&_.text-muted-foreground]:text-foreground/80",
          )}
          showCloseButton={!saving}
          onOpenAutoFocus={(event) => {
            const titleInput = document.getElementById(
              "task-title",
            ) as HTMLInputElement | null;
            if (titleInput && !titleInput.disabled) {
              event.preventDefault();
              titleInput.focus();
            }
          }}
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pr-12 text-left">
            <DialogTitle>{t(task ? "editQuiz" : "newQuiz")}</DialogTitle>
            <DialogDescription>
              {t(
                task
                  ? loading
                    ? "loadingEditor"
                    : closingLocked
                      ? "editClosedDescription"
                      : attemptStarted
                        ? "editStartedDescription"
                        : questionsLocked
                          ? "editDescription"
                          : "editScheduledDescription"
                  : "editorDescription",
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save(event.currentTarget);
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div
              data-slot="quiz-editor-body"
              className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5"
            >
              {loading ? (
                <div
                  role="status"
                  aria-label={t("loadingEditor")}
                  className="space-y-6"
                >
                  <span className="sr-only">{t("loadingEditor")}</span>
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="space-y-2" aria-hidden="true">
                      <Skeleton className="h-4 w-40 motion-reduce:animate-none" />
                      <Skeleton
                        className={`w-full motion-reduce:animate-none ${index === 1 ? "h-24" : "h-10"}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {formError && (
                    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      <p ref={errorRef} tabIndex={-1} role="alert">
                        {formError}
                      </p>
                      {errorTarget && (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto min-h-11 px-0 py-2 text-destructive"
                          onClick={() => {
                            setValidationAttempt((attempt) => attempt + 1);
                            requestAnimationFrame(() =>
                              document.getElementById(errorTarget)?.focus(),
                            );
                          }}
                        >
                          {t("goToError")}
                        </Button>
                      )}
                      {task &&
                        editSnapshot &&
                        (formError === t("settingsChanged") ||
                          formError === t("questionsLocked") ||
                          formError === t("startLocked")) && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              loadSnapshot(editSnapshot);
                              requestAnimationFrame(() =>
                                document.getElementById("task-title")?.focus(),
                              );
                            }}
                          >
                            {gradingT("loadCurrent")}
                          </Button>
                        )}
                    </div>
                  )}
                  {editingQuestions && questionsLocked && !formError && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t("questionsBecameVisible")}
                    </p>
                  )}
                  {!task && (
                    <Collapsible className="group">
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground has-[>svg]:px-0"
                        >
                          <Info className="size-4" aria-hidden="true" />
                          {t("howItWorks")}
                          <ChevronDown
                            aria-hidden="true"
                            className="size-4 transition-transform group-data-[state=open]:rotate-180"
                          />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="space-y-3 text-sm text-muted-foreground">
                          {(["time", "grading", "results"] as const).map(
                            (rule) => (
                              <li key={rule}>
                                <span className="font-medium text-foreground">
                                  {t(`help.${rule}.title`)}:
                                </span>{" "}
                                <span>{t(`help.${rule}.description`)}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                  <section
                    className="space-y-4"
                    aria-label={t("generalInformation")}
                  >
                    <h3 className="text-sm font-semibold">
                      {t("generalInformation")}
                    </h3>
                    <TaskContentFields
                      quiz
                      titleError={
                        errorTarget === "task-title" ? formError : undefined
                      }
                      title={title}
                      description={description}
                      disabled={disabled}
                      onTitleChange={(value) => {
                        setTitle(value);
                        setDirty(true);
                      }}
                      onDescriptionChange={(value) => {
                        setDescription(value);
                        setDirty(true);
                      }}
                    />
                  </section>
                  {editingQuestions ? (
                    <CourseQuizQuestionsEditor
                      questions={questions}
                      decimalPlaces={decimalPlaces}
                      disabled={disabled || questionsLocked}
                      issues={issues}
                      validationAttempt={validationAttempt}
                      onChange={(value) => {
                        setQuestions(value);
                        setDirty(true);
                        if (
                          value.length > 0 &&
                          errorTarget === "quiz-add-question"
                        ) {
                          setFormError(undefined);
                          setErrorTarget(undefined);
                        }
                      }}
                    >
                      {!task && shuffleControl}
                    </CourseQuizQuestionsEditor>
                  ) : null}
                  <section
                    className="space-y-4"
                    aria-label={t(
                      task ? "availability" : "timeAndAvailability",
                    )}
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">
                        {t(task ? "availability" : "timeAndAvailability")}
                      </h3>
                      {task && (
                        <p className="text-xs text-muted-foreground">
                          {t("courseTimeZone", { timeZone })}
                        </p>
                      )}
                    </div>
                    {!task && durationControl}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TaskDateFields
                        task={currentTask}
                        availableAt={availableAt}
                        dueAt={
                          closingLocked && currentTask?.dueAt
                            ? utcToLocalDateTime(currentTask.dueAt, timeZone)
                            : dueAt
                        }
                        timeZone={timeZone}
                        disabled={disabled}
                        quiz
                        closingLocked={closingLocked}
                        startError={
                          errorTarget === "task-start" ? formError : undefined
                        }
                        dueError={
                          errorTarget === "task-due" ? formError : undefined
                        }
                        onAvailableAtChange={(value) => {
                          setAvailableAt(value);
                          setDirty(true);
                        }}
                        onDueAtChange={(value) => {
                          setDueAt(value);
                          setDirty(true);
                        }}
                      />
                    </div>
                  </section>
                  {task && (
                    <section
                      className="space-y-4"
                      aria-label={t("attemptSettings")}
                    >
                      <h3 className="text-sm font-semibold">
                        {t("attemptSettings")}
                      </h3>
                      {attemptStarted ? (
                        <QuizAttemptSummary
                          durationMinutes={currentTask!.quiz!.durationMinutes}
                          shuffleQuestions={
                            currentTask!.quiz?.shuffleQuestions ?? false
                          }
                        />
                      ) : (
                        <>
                          {durationControl}
                          {shuffleControl}
                        </>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>
            <div className="shrink-0 space-y-2 border-t bg-background px-6 py-3">
              {editingQuestions && !loading && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold" aria-live="polite">
                    {t("questionCountValue", { count: questions.length })}
                  </p>
                  {questions.length > 0 && (
                    <Badge variant="outline">
                      {t(
                        questions.every(isAutomaticQuizQuestion)
                          ? "automaticGradingLabel"
                          : "manualGradingLabel",
                      )}
                    </Badge>
                  )}
                </div>
              )}
              {!task && (
                <p className="text-xs text-muted-foreground">
                  {t("publishLockNotice")}
                </p>
              )}
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={close}
                  disabled={saving}
                >
                  {taskT("cancel")}
                </Button>
                <Button
                  type="submit"
                  className={cn(
                    "min-h-11",
                    task &&
                      "bg-[color-mix(in_srgb,var(--primary)_95%,var(--foreground))] hover:bg-[color-mix(in_srgb,var(--primary)_90%,var(--foreground))]",
                  )}
                  disabled={disabled || (!task && !policy)}
                >
                  {saving && <Spinner aria-hidden="true" />}
                  {t(
                    task
                      ? "save"
                      : availableAt
                        ? "scheduleQuiz"
                        : "publishQuiz",
                  )}
                </Button>
              </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              {t("discardChanges")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
