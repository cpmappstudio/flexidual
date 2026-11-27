"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useCourseQuizReviewDraft,
  type QuizReviewDraft,
} from "@/hooks/use-course-quiz-review-draft";
import { isValidPoints, sameGradingConfiguration } from "@/lib/grading";
import { sumQuizPoints } from "@/lib/course-quizzes";
import { cn } from "@/lib/utils";
import {
  CourseQuizReviewQuestions,
  type QuizReview,
} from "./course-quiz-review-questions";
import { GradeHistory, GradeValue } from "./course-task-grade";

type Props = {
  taskId: Id<"courseTasks">;
  studentId: Id<"users">;
  timeZone: string;
  onClose: () => void;
};

export function CourseQuizTeacherReview({
  taskId,
  studentId,
  timeZone,
  onClose,
}: Props) {
  const t = useTranslations("courseQuizzes");
  const tasksT = useTranslations("courseTasks");
  const format = useFormatter();
  const isMobile = useIsMobile();
  const submission = useQuery(api.courseTaskSubmissions.get, {
    taskId,
    studentId,
  });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !busy) {
            if (pending) setConfirmingLeave(true);
            else onClose();
          }
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "w-full gap-0 overflow-hidden p-0 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center",
            isMobile
              ? "h-[90dvh] max-h-[90dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
              : "sm:max-w-2xl",
          )}
        >
          <SheetHeader className="shrink-0 gap-2 border-b py-5 pl-4 pr-16 text-left sm:pl-6">
            <SheetTitle className="break-words text-xl font-bold tracking-tight [overflow-wrap:anywhere]">
              {submission?.studentName ?? tasksT("review")}
            </SheetTitle>
            <SheetDescription>{t("reviewDescription")}</SheetDescription>
            {submission?.submittedAt !== undefined && (
              <p className="text-sm text-muted-foreground">
                {t("submittedAt", {
                  date: format.dateTime(submission.submittedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone,
                  }),
                })}
              </p>
            )}
          </SheetHeader>
          {submission === undefined ? (
            <div className="p-5">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : submission.submittedAt === undefined ? (
            <p className="p-5 text-sm text-muted-foreground">
              {t("reviewAfterSubmission")}
            </p>
          ) : (
            <QuizReviewLoader
              taskId={taskId}
              studentId={studentId}
              timeZone={timeZone}
              onBusyChange={setBusy}
              onPendingChange={setPending}
            />
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmingLeave} onOpenChange={setConfirmingLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveReviewDescription")}
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

function QuizReviewLoader({
  taskId,
  studentId,
  ...props
}: Omit<Props, "onClose"> & {
  onBusyChange: (busy: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const review = useQuery(api.courseQuizzes.getReview, { taskId, studentId });
  const grade = useQuery(api.courseTaskGrades.get, { taskId, studentId });
  if (!review || !grade)
    return (
      <div className="p-5">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  return (
    <QuizReviewEditor
      taskId={taskId}
      studentId={studentId}
      review={review}
      grade={grade}
      {...props}
    />
  );
}

export function QuizReviewEditor({
  taskId,
  studentId,
  timeZone,
  review,
  grade,
  onBusyChange,
  onPendingChange,
}: Omit<Props, "onClose"> & {
  review: QuizReview;
  grade: FunctionReturnType<typeof api.courseTaskGrades.get>;
  onBusyChange: (busy: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useTranslations("courseQuizzes");
  const format = useFormatter();
  const gradingT = useTranslations("grading");
  const saveReview = useMutation(api.courseQuizzes.saveReview);
  const { draft, setDraft, clearDraftIf } = useCourseQuizReviewDraft(
    taskId,
    studentId,
  );
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [pendingVersion, setPendingVersion] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const publishOperation = useRef<{ version: number; id: string } | undefined>(
    undefined,
  );
  const commentId = useId();
  const savedScores = Object.fromEntries(
    review.scores.map(({ questionId, points }) => [
      questionId,
      points === null ? "" : String(points),
    ]),
  );
  const scores = draft?.scores ?? savedScores;
  const comment = draft?.comment ?? review.comment ?? "";
  const textQuestions = review.questions.filter(
    (question) => question.kind === "text",
  );
  const hasAnswer = (id: string) =>
    review.answers.some(
      ({ questionId, answer }) =>
        questionId === id && answer.kind === "text" && !!answer.text.trim(),
    );
  const manualScores = textQuestions.map((question) => ({
    questionId: question._id,
    points: !hasAnswer(question._id)
      ? 0
      : (scores[question._id] ?? "").trim() === ""
        ? null
        : Number(scores[question._id]),
  }));
  const valid = manualScores.every(
    ({ questionId, points }) =>
      points === null ||
      isValidPoints(
        points,
        textQuestions.find((q) => q._id === questionId)!.maxPoints,
        review.grading.decimalPlaces,
      ),
  );
  const incomplete = manualScores.filter(
    ({ points }) => points === null,
  ).length;
  const total = sumQuizPoints(
    [
      ...review.scores
        .filter(
          ({ questionId }) => !textQuestions.some((q) => q._id === questionId),
        )
        .map(({ points }) => points ?? 0),
      ...manualScores.map(({ points }) => points ?? 0),
    ],
    review.grading.decimalPlaces,
  );
  const hasChanges =
    manualScores.some(
      ({ questionId, points }) =>
        points !==
        (review.scores.find((score) => score.questionId === questionId)
          ?.points ?? null),
    ) || comment.trim() !== (review.comment ?? "");
  const contextChanged =
    !!draft &&
    (draft.submissionRevision !== review.submissionRevision ||
      !sameGradingConfiguration(draft.grading, review.grading));
  const recovered =
    !!draft && !contextChanged && !hasChanges && draft.version < review.version;
  const stale =
    !!draft &&
    (contextChanged || (draft.version !== review.version && !recovered));
  const waiting =
    review.version < pendingVersion || grade.version !== review.version;
  const canSave =
    !busy &&
    !waiting &&
    !stale &&
    valid &&
    (hasChanges || (!grade.draft && !grade.published));
  const canPublish =
    !busy &&
    !waiting &&
    !stale &&
    !incomplete &&
    valid &&
    (hasChanges ||
      grade.draft?.submissionRevision === review.submissionRevision ||
      !grade.published);
  const pending = busy || waiting || stale || hasChanges;
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  const clearConfirmed = useEffectEvent((operationId: string) =>
    clearDraftIf((current) => current.operationId === operationId),
  );
  useEffect(() => {
    if (draft && !stale && !hasChanges) clearConfirmed(draft.operationId);
  }, [stale, hasChanges, draft]);
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  function edit(patch: Partial<Pick<QuizReviewDraft, "scores" | "comment">>) {
    setSaveFailed(false);
    publishOperation.current = undefined;
    setDraft({
      scores,
      comment,
      version: review.version,
      submissionRevision: review.submissionRevision,
      grading: review.grading,
      ...(recovered ? undefined : draft),
      ...patch,
      operationId: crypto.randomUUID(),
    });
  }

  async function mutate(kind: "save" | "publish") {
    if (inFlight.current || !(kind === "save" ? canSave : canPublish)) return;
    inFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    try {
      const localOperationId = draft?.operationId;
      if (
        kind === "publish" &&
        publishOperation.current?.version !== review.version
      )
        publishOperation.current = {
          version: review.version,
          id: crypto.randomUUID(),
        };
      const operationId =
        kind === "publish"
          ? publishOperation.current!.id
          : (localOperationId ?? crypto.randomUUID());
      const version = await saveReview({
        taskId,
        studentId,
        scores: manualScores,
        comment: comment.trim() || undefined,
        expectedVersion: draft?.version ?? review.version,
        expectedSubmissionRevision:
          draft?.submissionRevision ?? review.submissionRevision,
        expectedGrading: draft?.grading ?? review.grading,
        operationId,
        ...(kind === "publish" ? { publish: true } : {}),
      });
      clearDraftIf((current) => current.operationId === localOperationId);
      setSaveFailed(false);
      toast.success(
        kind === "save"
          ? t("reviewSaved")
          : grade.availableAt !== undefined
            ? t("gradeScheduled")
            : gradingT("published"),
      );
      setPendingVersion(version);
    } catch {
      setSaveFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      data-pending-quiz-review={pending ? taskId : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void mutate("save");
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
        {grade.published && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              {t(
                grade.availableAt !== undefined
                  ? "preparedGrade"
                  : "publishedGrade",
              )}
            </span>
            <GradeValue
              points={grade.published.points}
              grading={review.grading}
            />
          </div>
        )}
        <CourseQuizReviewQuestions
          review={review}
          editor={{
            scores,
            readOnly: busy || waiting || stale,
            onChange: (id, value) =>
              edit({ scores: { ...scores, [id]: value } }),
          }}
        />
        <div className="grid gap-2 border-t pt-5">
          <Label htmlFor={commentId}>{gradingT("comment")}</Label>
          <Textarea
            id={commentId}
            value={comment}
            maxLength={2000}
            rows={3}
            readOnly={busy || waiting || stale}
            onChange={(event) => edit({ comment: event.target.value })}
          />
        </div>
        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            {t("reviewHistory")}
          </Button>
          {historyOpen && (
            <GradeHistory
              taskId={taskId}
              studentId={studentId}
              timeZone={timeZone}
              grading={review.grading}
            />
          )}
        </div>
      </div>
      <div
        className="shrink-0 space-y-3 border-t bg-background px-4 py-4 sm:px-6"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {valid && !incomplete ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("earnedPoints", {
                  points: format.number(total),
                  max: format.number(review.grading.maxPoints),
                })}
              </p>
              <div className="flex items-center gap-2">
                <span>{gradingT("title")}</span>
                <GradeValue points={total} grading={review.grading} />
              </div>
            </div>
          ) : (
            <span>
              {!valid
                ? t("invalidReviewScore")
                : t("questionsPending", { count: incomplete })}
            </span>
          )}
          <Badge variant="outline">
            {t(
              hasChanges
                ? "reviewUnsaved"
                : grade.draft
                  ? "privateDraft"
                  : grade.published
                    ? grade.availableAt !== undefined
                      ? "gradeScheduled"
                      : "gradePublished"
                    : "reviewNotSaved",
            )}
          </Badge>
        </div>
        {(waiting ||
          hasChanges ||
          incomplete ||
          canPublish ||
          grade.availableAt !== undefined) && (
          <p className="text-xs text-muted-foreground">
            {waiting
              ? t("reviewUpdating")
              : incomplete
                ? t("partialReviewHint")
                : grade.availableAt !== undefined
                  ? t(
                      grade.published && !grade.draft && !hasChanges
                        ? "gradeAvailableAt"
                        : "publishAtCloseHint",
                      {
                        date: format.dateTime(grade.availableAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone,
                        }),
                      },
                    )
                  : t("publishNowHint")}
          </p>
        )}
        {stale || saveFailed ? (
          <p role="alert" className="text-sm text-destructive">
            {gradingT(
              stale ? (contextChanged ? "stale" : "staleVersion") : "saveError",
            )}
          </p>
        ) : null}
        {stale && draft && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDraft(undefined)}
            >
              {gradingT("loadCurrent")}
            </Button>
            {!contextChanged && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || waiting}
                onClick={() =>
                  setDraft({
                    ...draft,
                    version: review.version,
                    operationId: crypto.randomUUID(),
                  })
                }
              >
                {gradingT("keepLocalDraft")}
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" variant="outline" disabled={!canSave}>
            {busy && <Spinner aria-hidden="true" />}
            {t("saveReview")}
          </Button>
          <Button
            type="button"
            disabled={!canPublish}
            onClick={() => void mutate("publish")}
          >
            {grade.availableAt !== undefined
              ? t("publishAtClose")
              : gradingT("publish")}
          </Button>
        </div>
      </div>
    </form>
  );
}
