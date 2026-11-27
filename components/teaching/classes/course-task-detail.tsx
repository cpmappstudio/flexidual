"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import type { FunctionReturnType } from "convex/server";
import { useAuth } from "@clerk/nextjs";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  MessageSquareText,
  Paperclip,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DataTable } from "@/components/table/data-table";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentTime } from "@/hooks/use-current-time";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { MAX_TASK_SUBMISSION_FILES } from "@/lib/course-task-files";
import { cn } from "@/lib/utils";
import {
  TaskAttachmentList,
  TaskFilePicker,
  TaskFileUploadError,
  TaskFileUploadStatus,
  uploadTaskFiles,
  useTaskFileUploadErrorMessage,
  type TaskAttachment,
} from "./course-task-attachments";
import { useTaskFileRequest } from "@/hooks/use-task-file-request";
import { useTaskFeedbackDraft } from "@/hooks/use-task-feedback-draft";
import { hasUnloadedTaskGradeDraft } from "@/hooks/use-task-grade-draft";
import { hasLocalQuizReviewDraft } from "@/hooks/use-course-quiz-review-draft";
import { TaskPreviousCorrection } from "./course-task-previous-correction";
import { CourseTaskGrade, GradeEditor, GradeValue } from "./course-task-grade";
import { CourseTaskHeader } from "./course-task-header";
import { CourseTaskSummary } from "./course-task-summary";
import { CourseQuizDetail } from "./course-quiz-detail";
import { CourseQuizTeacherReview } from "./course-quiz-teacher-review";

type SubmissionRow = FunctionReturnType<
  typeof api.courseTaskSubmissions.listForTask
>["page"][number];

export function CourseTaskDetail({
  classId,
  taskId,
  timeZone,
  onEdit,
  onDelete,
}: {
  classId: Id<"classes">;
  taskId: Id<"courseTasks">;
  timeZone: string;
  onEdit: (task: Doc<"courseTasks">, materials: TaskAttachment[]) => void;
  onDelete: (task: Doc<"courseTasks">) => void;
}) {
  const t = useTranslations("courseTasks");
  const now = useCurrentTime();
  const task = useQuery(api.courseTasks.get, { taskId });
  const matchesCourse = task?.classId === classId;
  const statusResult = useQuery(
    api.courseTasks.getStatus,
    matchesCourse
      ? { taskId, now: Math.max(now, task.releasedAt ?? 0, task.updatedAt) }
      : "skip",
  );
  const status = useRetainedQueryResult(statusResult, taskId);
  const materials = useQuery(
    api.courseTaskFiles.listMaterials,
    matchesCourse ? { taskId } : "skip",
  );

  if (task === undefined) return <Skeleton className="h-72 w-full" />;
  if (!task || task.isDraft || !matchesCourse) return <p>{t("notFound")}</p>;
  if (status === undefined || materials === undefined)
    return <Skeleton className="h-72 w-full" />;

  if (task.kind === "quiz")
    return (
      <CourseQuizDetail
        task={task}
        canManage={status.canManage}
        submissionsOpen={status.submissionsOpen}
        timeZone={timeZone}
        onEdit={() => onEdit(task, materials)}
        onDelete={() => onDelete(task)}
      >
        {task.releasedAt === undefined ? (
          <p className="text-sm text-muted-foreground">
            {t("studentsAssignedAtStart")}
          </p>
        ) : (
          <TeacherTaskSubmissions
            key={taskId}
            taskId={taskId}
            timeZone={timeZone}
            canGrade={!!task.grading}
            quiz
          />
        )}
      </CourseQuizDetail>
    );

  return (
    <div className="min-w-0 space-y-4 py-2">
      <section className="min-w-0 space-y-4">
        <CourseTaskHeader
          task={task}
          canManage={status.canManage}
          submissionsOpen={status.submissionsOpen}
          onEdit={() => onEdit(task, materials)}
          onDelete={() => onDelete(task)}
        />
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold text-foreground">{t("instructions")}</h3>
          <p
            className={cn(
              "whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]",
              !task.description && "text-muted-foreground",
            )}
          >
            {task.description || t("noDescription")}
          </p>
        </div>
      </section>

      <CourseTaskSummary
        task={task}
        timeZone={timeZone}
        canManage={status.canManage}
      />

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            {t("materials")}
          </h3>
          {materials.length > 0 && (
            <Badge className="min-w-6 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
              {materials.length}
            </Badge>
          )}
        </div>
        {materials.length > 0 ? (
          <TaskAttachmentList files={materials} plain />
        ) : (
          <p className="text-sm text-muted-foreground">{t("noMaterials")}</p>
        )}
      </section>

      {status.canManage ? (
        task.releasedAt === undefined ? (
          <p className="text-sm text-muted-foreground">
            {t("studentsAssignedAtStart")}
          </p>
        ) : (
          <TeacherTaskSubmissions
            key={taskId}
            taskId={taskId}
            timeZone={timeZone}
            canGrade={!!task.grading}
          />
        )
      ) : (
        <>
          {task.grading && (
            <CourseTaskGrade taskId={taskId} timeZone={timeZone} />
          )}
          <StudentTaskSubmission
            taskId={taskId}
            canSubmit={status.canSubmit}
            timeZone={timeZone}
          />
        </>
      )}
    </div>
  );
}

function StudentTaskSubmission({
  taskId,
  canSubmit,
  timeZone,
}: {
  taskId: Id<"courseTasks">;
  canSubmit: boolean;
  timeZone: string;
}) {
  const t = useTranslations("courseTasks");
  const request = useTaskFileRequest();
  const uploadErrorMessage = useTaskFileUploadErrorMessage();
  const submission = useQuery(api.courseTaskSubmissions.get, { taskId });
  const submit = useMutation(api.courseTaskSubmissions.submit);
  const cancelStaged = useMutation(api.courseTaskFiles.cancelStaged);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [submissionError, setSubmissionError] = useState<string>();
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);

  function closeSubmissionEditor() {
    setIsEditingSubmission(false);
    setFiles([]);
    setUploaded(0);
    setSubmissionError(undefined);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || saving || !canSubmit) return;
    setSaving(true);
    setUploaded(0);
    setSubmissionError(undefined);
    const stagedIds: Id<"courseTaskFiles">[] = [];
    try {
      const fileIds = await uploadTaskFiles(
        files,
        taskId,
        "submission",
        request,
        setUploaded,
        (fileId) => stagedIds.push(fileId),
      );
      await submit({ taskId, fileIds });
      closeSubmissionEditor();
      toast.success(t("submitted"));
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "data" in error &&
        typeof error.data === "string"
          ? error.data
          : error instanceof Error
            ? error.message
            : "";
      setSubmissionError(
        error instanceof TaskFileUploadError
          ? uploadErrorMessage(error)
          : code.includes("TASK_SUBMISSION_CLOSED")
            ? t("submissionClosed")
            : code.includes("INVALID_TASK_FILES")
              ? t("submissionFilesUnavailable")
              : t("submissionError"),
      );
      await Promise.allSettled(stagedIds.map((id) => cancelStaged({ id })));
    } finally {
      setSaving(false);
    }
  }

  if (submission === undefined) return <Skeleton className="h-40 w-full" />;
  const hasSubmission = submission.submittedAt !== undefined;
  const hasCorrectedPdfs = submission.files.some(
    (file) =>
      file.contentType === "application/pdf" && file.correctedAt !== undefined,
  );
  const submissionForm = (
    <form className="min-w-0 space-y-4" onSubmit={(event) => void send(event)}>
      <div className="min-w-0 space-y-3">
        <h4 className="text-sm font-semibold text-foreground">
          {t(hasSubmission ? "replacementFiles" : "filesToSubmit")}
        </h4>
        <TaskFilePicker
          files={files}
          onChange={(next) => {
            setFiles(next);
            setSubmissionError(undefined);
          }}
          maxFiles={MAX_TASK_SUBMISSION_FILES}
          disabled={saving}
        />
      </div>
      {submissionError && (
        <p role="alert" className="text-sm text-destructive">
          {submissionError}
        </p>
      )}
      {!canSubmit && (
        <p role="alert" className="text-sm text-destructive">
          {t("submissionClosed")}
        </p>
      )}
      {saving && (
        <TaskFileUploadStatus completed={uploaded} total={files.length} />
      )}
      {hasSubmission && (
        <div className="flex items-start gap-3 rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          <TriangleAlert
            className="mt-0.5 size-5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1 leading-relaxed">
            <p>{t("replacementWarning")}</p>
            {hasCorrectedPdfs && (
              <p>
                {t(
                  submission.previousCorrection
                    ? "replacementCorrectionWarningWithPrevious"
                    : "replacementCorrectionWarning",
                )}
              </p>
            )}
          </div>
        </div>
      )}
      <div
        className={
          hasSubmission
            ? "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
            : undefined
        }
      >
        {hasSubmission && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={closeSubmissionEditor}
          >
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" disabled={!files.length || saving || !canSubmit}>
          {saving && <Spinner aria-hidden="true" />}
          {t(hasSubmission ? "resubmit" : "submit")}
        </Button>
      </div>
    </form>
  );

  return (
    <section className="min-w-0 space-y-4 rounded-xl border bg-muted/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-foreground">{t("yourSubmission")}</h3>
        {hasSubmission && (
          <Badge
            variant={submission.submittedLate ? "outline" : "active"}
            className={
              submission.submittedLate
                ? "border-warning/40 bg-warning/15 text-warning-foreground"
                : undefined
            }
          >
            {t(submission.submittedLate ? "submittedLate" : "submittedOnTime")}
          </Badge>
        )}
      </div>
      {hasSubmission ? (
        <TaskAttachmentList files={submission.files} plain submission compact />
      ) : (
        <p className="text-sm text-muted-foreground">{t("notSubmitted")}</p>
      )}
      {hasSubmission ? (
        canSubmit || isEditingSubmission ? (
          <Dialog
            open={isEditingSubmission}
            onOpenChange={(open) => {
              if (open) setIsEditingSubmission(true);
              else if (!saving) closeSubmissionEditor();
            }}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
                disabled={!canSubmit}
              >
                <Pencil className="size-4" aria-hidden="true" />
                {t("editSubmission")}
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-xl"
              showCloseButton={!saving}
              onEscapeKeyDown={(event) => saving && event.preventDefault()}
              onInteractOutside={(event) => saving && event.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>{t("editSubmission")}</DialogTitle>
                <DialogDescription className="sr-only">
                  {t("editSubmissionDescription")}
                </DialogDescription>
              </DialogHeader>
              {submissionForm}
            </DialogContent>
          </Dialog>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("submissionClosed")}
          </p>
        )
      ) : canSubmit ? (
        submissionForm
      ) : (
        <p className="text-sm text-muted-foreground">{t("submissionClosed")}</p>
      )}
      {hasSubmission && submission.feedback && (
        <div className="flex max-w-2xl min-w-0 items-start gap-3 rounded-2xl rounded-tl-sm bg-primary/5 px-4 py-3">
          <MessageSquareText
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1">
            <h4 className="text-sm font-semibold text-primary">
              {t("teacherFeedback")}
            </h4>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {submission.feedback.text}
            </p>
          </div>
        </div>
      )}
      <TaskPreviousCorrection
        correction={submission.previousCorrection}
        timeZone={timeZone}
        compactFiles
      />
    </section>
  );
}

function TeacherTaskSubmissions({
  taskId,
  timeZone,
  canGrade,
  quiz = false,
}: {
  taskId: Id<"courseTasks">;
  timeZone: string;
  canGrade: boolean;
  quiz?: boolean;
}) {
  const t = useTranslations("courseTasks");
  const common = useTranslations("common");
  const format = useFormatter();
  const gradingT = useTranslations("grading");
  const quizT = useTranslations("courseQuizzes");
  const { userId } = useAuth();
  const searchParams = useSearchParams();
  const linkedStudentId =
    searchParams.get("task") === taskId ? searchParams.get("student") : null;
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseTaskSubmissions.listForTask,
    { taskId },
    { initialNumItems: 20 },
  );
  const publicationScheduled =
    quiz && results.some(({ grade }) => grade?.availableAt !== undefined);
  const hasPublishableDrafts = useQuery(
    api.courseTaskGrades.hasPublishableDrafts,
    canGrade ? { taskId } : "skip",
  );
  const publishAll = useMutation(api.courseTaskGrades.publishAll);
  const publishing = useRef(false);
  const submissionsRef = useRef<HTMLElement>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const canPublishAll =
    status !== "LoadingFirstPage" && !!hasPublishableDrafts && !publishingAll;

  async function publishAllGrades() {
    if (!canPublishAll || publishing.current) return;
    if (
      submissionsRef.current?.querySelector("[data-pending-grade]") ||
      (quiz &&
        (hasLocalQuizReviewDraft(userId, taskId) ||
          Array.from(
            document.querySelectorAll("[data-pending-quiz-review]"),
          ).some(
            (element) =>
              element.getAttribute("data-pending-quiz-review") === taskId,
          ))) ||
      hasUnloadedTaskGradeDraft(
        userId,
        taskId,
        new Set(results.map(({ studentId }) => studentId)),
      )
    ) {
      toast.warning(gradingT("publishAllPending"));
      return;
    }
    publishing.current = true;
    setPublishingAll(true);
    let published = 0;
    let skipped = 0;
    try {
      const operationId = crypto.randomUUID();
      let continuation:
        | NonNullable<
            FunctionReturnType<
              typeof api.courseTaskGrades.publishAll
            >["continuation"]
          >
        | undefined;
      do {
        const batch = await publishAll({ taskId, operationId, continuation });
        published += batch.published;
        skipped += batch.skipped;
        continuation = batch.continuation ?? undefined;
      } while (continuation);
      if (published)
        toast.success(
          publicationScheduled
            ? quizT("gradesScheduled", { count: published })
            : gradingT("publishedAll", { count: published }),
        );
      if (skipped) toast.warning(gradingT("publishAllSkipped"));
    } catch {
      toast.error(
        publicationScheduled
          ? quizT("gradesScheduleError", { count: published })
          : gradingT("publishAllError", { count: published }),
      );
    } finally {
      publishing.current = false;
      setPublishingAll(false);
    }
  }
  const [selectedStudent, setSelectedStudent] = useState<
    Id<"users"> | undefined
  >(linkedStudentId ? (linkedStudentId as Id<"users">) : undefined);
  const [previousLinkedStudentId, setPreviousLinkedStudentId] =
    useState(linkedStudentId);
  if (previousLinkedStudentId !== linkedStudentId) {
    setPreviousLinkedStudentId(linkedStudentId);
    setSelectedStudent(
      linkedStudentId ? (linkedStudentId as Id<"users">) : undefined,
    );
  }

  const selectStudent = useCallback(
    (studentId?: Id<"users">) => {
      setSelectedStudent(studentId);
      const url = new URL(window.location.href);
      if (studentId) {
        url.searchParams.set("task", taskId);
        url.searchParams.set("student", studentId);
      } else url.searchParams.delete("student");
      window.history.replaceState(null, "", url);
    },
    [taskId],
  );
  const columns = useMemo<ColumnDef<SubmissionRow, unknown>[]>(
    () => [
      {
        id: "student",
        accessorFn: (row) => row.studentName,
        header: t("student"),
        cell: ({ row }) => (
          <div className="min-w-0 whitespace-normal break-words font-medium">
            {row.original.studentName}
          </div>
        ),
      },
      {
        id: "status",
        header: t("status"),
        cell: ({ row }) => {
          const submission = row.original;
          if (submission.submittedAt === undefined) {
            return <Badge variant="inactive">{t("pending")}</Badge>;
          }
          return submission.submittedLate ? (
            <Badge
              variant="outline"
              className="border-warning/40 bg-warning/15 text-warning-foreground"
            >
              {t("late")}
            </Badge>
          ) : (
            <Badge variant="active">{t("delivered")}</Badge>
          );
        },
      },
      {
        id: "submittedAt",
        header: t("submittedAt"),
        cell: ({ row }) =>
          row.original.submittedAt === undefined
            ? "—"
            : format.dateTime(row.original.submittedAt, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone,
              }),
      },
      ...(canGrade
        ? [
            {
              id: "grade",
              header: gradingT("title"),
              cell: ({ row }: { row: { original: SubmissionRow } }) => {
                const { grade, studentId, studentName, submissionRevision } =
                  row.original;
                if (quiz)
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {grade?.published && grade.grading ? (
                        <GradeValue
                          points={grade.published.points}
                          grading={grade.grading}
                        />
                      ) : (
                        "—"
                      )}
                      {grade?.published && grade.availableAt !== undefined && (
                        <Badge variant="outline">
                          {quizT("gradeScheduled")}
                        </Badge>
                      )}
                      {grade?.draft && (
                        <Badge variant="outline">{quizT("privateDraft")}</Badge>
                      )}
                    </div>
                  );
                return grade?.grading && selectedStudent !== studentId ? (
                  <GradeEditor
                    key={`${taskId}:${studentId}`}
                    taskId={taskId}
                    studentId={studentId}
                    studentName={studentName}
                    submissionRevision={submissionRevision}
                    grade={grade}
                    compact
                  />
                ) : (
                  "—"
                );
              },
            },
          ]
        : []),
      {
        id: "actions",
        header: () => <div className="text-right">{common("actions")}</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={
                (quiz || !canGrade) && row.original.submittedAt === undefined
              }
              onClick={() => selectStudent(row.original.studentId)}
            >
              {t("review")}
            </Button>
          </div>
        ),
      },
    ],
    [
      common,
      format,
      t,
      timeZone,
      selectStudent,
      canGrade,
      gradingT,
      taskId,
      selectedStudent,
      quiz,
      quizT,
    ],
  );

  return (
    <section ref={submissionsRef} className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{t("submissions")}</h4>
        {canGrade && (!quiz || hasPublishableDrafts || publishingAll) && (
          <Button
            type="button"
            size="sm"
            disabled={!canPublishAll}
            onClick={() => void publishAllGrades()}
          >
            {publishingAll && <Spinner aria-hidden="true" />}
            {publicationScheduled
              ? quizT("publishAllAtClose")
              : gradingT("publishAll")}
          </Button>
        )}
      </div>
      {status === "LoadingFirstPage" ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <DataTable
          data={results}
          columns={columns}
          emptyMessage={t("noStudents")}
          paginate={false}
        />
      )}
      {status === "CanLoadMore" && (
        <Button type="button" variant="outline" onClick={() => loadMore(20)}>
          {t("loadMore")}
        </Button>
      )}
      {selectedStudent &&
        (quiz ? (
          <CourseQuizTeacherReview
            key={selectedStudent}
            taskId={taskId}
            studentId={selectedStudent}
            timeZone={timeZone}
            onClose={() => selectStudent()}
          />
        ) : (
          <TeacherSubmissionReview
            key={selectedStudent}
            taskId={taskId}
            studentId={selectedStudent}
            timeZone={timeZone}
            canGrade={canGrade}
            onClose={() => selectStudent()}
          />
        ))}
    </section>
  );
}

function TeacherSubmissionReview({
  taskId,
  studentId,
  timeZone,
  onClose,
  canGrade,
}: {
  taskId: Id<"courseTasks">;
  studentId: Id<"users">;
  timeZone: string;
  onClose: () => void;
  canGrade: boolean;
}) {
  const t = useTranslations("courseTasks");
  const format = useFormatter();
  const isMobile = useIsMobile();
  const submission = useQuery(api.courseTaskSubmissions.get, {
    taskId,
    studentId,
  });
  const setFeedback = useMutation(api.courseTaskSubmissions.setFeedback);
  const { draft: feedback, setDraft: setFeedbackText } = useTaskFeedbackDraft(
    taskId,
    studentId,
  );
  const [saving, setSaving] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const savedFeedback = submission?.feedback?.text ?? "";
  const currentFeedback = feedback?.text ?? savedFeedback;
  const staleFeedback =
    feedback !== undefined &&
    feedback.revision !== submission?.submissionRevision;
  const hasChanges = currentFeedback.trim() !== savedFeedback.trim();
  const canSaveFeedback =
    !staleFeedback &&
    hasChanges &&
    (Boolean(currentFeedback.trim()) || Boolean(savedFeedback));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission || saving || !canSaveFeedback) return;
    setSaving(true);
    try {
      await setFeedback({
        taskId,
        studentId,
        text: currentFeedback.trim() || null,
        expectedRevision: feedback!.revision,
      });
      setFeedbackText(undefined);
      toast.success(
        t(currentFeedback.trim() ? "feedbackSaved" : "feedbackRemoved"),
      );
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Sheet open onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "w-full gap-0 overflow-hidden p-0 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center",
          isMobile
            ? "h-[90dvh] max-h-[90dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            : "sm:max-w-lg",
        )}
      >
        <SheetHeader className="shrink-0 gap-2 border-b py-5 pl-4 pr-16 text-left sm:pl-6">
          <SheetTitle className="break-words text-xl font-bold tracking-tight [overflow-wrap:anywhere]">
            {submission?.studentName ?? t("review")}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("reviewDescription")}
          </SheetDescription>
          {submission !== undefined && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {submission.submittedAt !== undefined && (
                <span>
                  {format.dateTime(submission.submittedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone,
                  })}
                </span>
              )}
              <Badge
                variant={submission.submittedLate ? "outline" : "active"}
                className={
                  submission.submittedLate
                    ? "border-warning/40 bg-warning/15 text-warning-foreground"
                    : undefined
                }
              >
                {t(
                  submission.submittedAt === undefined
                    ? "pending"
                    : submission.submittedLate
                      ? "late"
                      : "delivered",
                )}
              </Badge>
            </div>
          )}
        </SheetHeader>
        {submission === undefined ? (
          <div className="px-4 py-2 sm:px-6">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
            <section className="min-w-0 space-y-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Paperclip
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                    {t("submissionFiles")}
                  </h3>
                  <Badge
                    variant="outline"
                    className="min-w-6 rounded-full border-transparent bg-muted text-muted-foreground tabular-nums"
                  >
                    {submission.files.length}
                  </Badge>
                </div>
              </div>
              <TaskAttachmentList
                files={submission.files}
                plain
                submission
                editPdfs
                onPdfOpenChange={setPdfOpen}
              />
            </section>

            {canGrade && !pdfOpen && (
              <CourseTaskGrade
                taskId={taskId}
                studentId={studentId}
                submissionRevision={submission.submissionRevision}
                timeZone={timeZone}
              />
            )}
            {submission.submittedAt !== undefined && (
              <form
                onSubmit={(event) => void save(event)}
                className="space-y-3 border-t pt-5"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="task-feedback"
                      className="flex items-center gap-2 text-sm font-semibold text-foreground"
                    >
                      <MessageSquareText
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                      {t("feedback")}
                    </label>
                    {hasChanges && (
                      <Badge variant="outline" role="status" aria-atomic="true">
                        {t("feedbackUnsaved")}
                      </Badge>
                    )}
                  </div>
                  {!hasChanges && submission.feedback && (
                    <p className="text-xs text-muted-foreground">
                      {t("feedbackSentAt", {
                        date: format.dateTime(submission.feedback.updatedAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone,
                        }),
                      })}
                    </p>
                  )}
                </div>
                {staleFeedback && (
                  <div
                    role="alert"
                    className="space-y-2 text-sm text-destructive"
                  >
                    <p>{t("pdfCorrection.submissionChanged")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setFeedbackText(undefined)}
                    >
                      {t("pdfCorrection.useCurrentSubmission")}
                    </Button>
                  </div>
                )}
                <Textarea
                  id="task-feedback"
                  maxLength={2000}
                  rows={4}
                  value={currentFeedback}
                  onChange={(event) =>
                    setFeedbackText({
                      text: event.target.value,
                      revision:
                        feedback?.revision ?? submission.submissionRevision,
                    })
                  }
                  disabled={saving}
                  placeholder={t("feedbackPlaceholder")}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    className="pointer-coarse:min-h-11"
                    disabled={saving || !canSaveFeedback}
                    variant={
                      savedFeedback && !currentFeedback.trim()
                        ? "destructive"
                        : "default"
                    }
                  >
                    {saving && <Spinner aria-hidden="true" />}
                    {savedFeedback
                      ? currentFeedback.trim()
                        ? t("updateFeedback")
                        : t("removeFeedback")
                      : t("sendFeedback")}
                  </Button>
                </div>
              </form>
            )}
            <TaskPreviousCorrection
              correction={submission.previousCorrection}
              timeZone={timeZone}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
