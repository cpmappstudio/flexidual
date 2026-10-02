"use client";

import { useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import type { ColumnDef } from "@tanstack/react-table";
import type { FunctionReturnType } from "convex/server";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CalendarClock,
  Clock3,
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
  useTaskFileRequest,
  type TaskAttachment,
} from "./course-task-attachments";

type SubmissionRow = FunctionReturnType<
  typeof api.courseTaskSubmissions.listForTask
>["page"][number];

export function CourseTaskDetail({
  classId,
  taskId,
  timeZone,
  onEdit,
}: {
  classId: Id<"classes">;
  taskId: Id<"courseTasks">;
  timeZone: string;
  onEdit: (task: Doc<"courseTasks">, materials: TaskAttachment[]) => void;
}) {
  const t = useTranslations("courseTasks");
  const format = useFormatter();
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

  function formatTaskDate(value: number) {
    return format.dateTime(value, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  }

  const publicationStatus =
    task.releasedAt !== undefined
      ? t(status.submissionsOpen ? "visibleStatus" : "closedStatus")
      : t("scheduledStatus");
  const availabilityDate = task.releasedAt ?? task.availableAt;

  return (
    <div className="min-w-0 space-y-4 py-2">
      <section className="min-w-0 space-y-4">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <Image
            src="/assigments-icon.svg"
            alt=""
            width={60}
            height={60}
            className="size-12 shrink-0 sm:size-15"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 space-y-1.5">
                <Badge
                  className={cn(
                    "font-semibold",
                    task.releasedAt !== undefined && status.submissionsOpen
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary/15 text-secondary-foreground",
                  )}
                >
                  {publicationStatus}
                </Badge>
                <h3 className="break-words text-xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-2xl">
                  {task.title}
                </h3>
              </div>
              {status.canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 self-start text-foreground hover:bg-primary/5 hover:text-primary"
                  onClick={() => onEdit(task, materials)}
                >
                  <Pencil className="size-4 text-primary" />
                  {t("editTask")}
                </Button>
              )}
            </div>
          </div>
        </div>
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

      <section className="space-y-4">
        <h3 className="font-semibold text-foreground">
          {t("datesAndAvailability")}
        </h3>
        <div className="grid gap-y-4 sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-2 py-1">
            <span
              className="flex size-9 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <CalendarClock className="size-6 text-primary" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("availableFrom")}
              </p>
              <p className="break-words text-sm font-semibold text-foreground">
                {availabilityDate === undefined
                  ? t("noStartDate")
                  : formatTaskDate(availabilityDate)}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-2 py-1">
            <span
              className="flex size-9 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <CalendarClock className="size-6 text-primary" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("deadlineLabel")}
              </p>
              <p className="break-words text-sm font-semibold text-foreground">
                {task.dueAt === undefined
                  ? t("noDeadline")
                  : formatTaskDate(task.dueAt)}
              </p>
            </div>
          </div>
          {task.manuallyClosedAt !== undefined && (
            <div className="flex min-w-0 items-start gap-3 py-1">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Clock3 className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("closedAtLabel")}
                </p>
                <p className="break-words text-sm font-semibold text-foreground">
                  {formatTaskDate(task.manuallyClosedAt)}
                </p>
              </div>
            </div>
          )}
        </div>
        {status.canManage && task.dueAt !== undefined && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{t("lateSubmissionsLabel")}: </span>
            {t(
              task.allowLateSubmissions
                ? "lateSubmissionsAllowed"
                : "lateSubmissionsNotAllowed",
            )}
          </p>
        )}
        {task.dueAt === undefined && (
          <p className="text-sm text-muted-foreground">{t("noDeadlineHint")}</p>
        )}
      </section>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Paperclip className="size-5 text-primary" aria-hidden="true" />
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
          <TeacherTaskSubmissions taskId={taskId} timeZone={timeZone} />
        )
      ) : (
        <StudentTaskSubmission taskId={taskId} canSubmit={status.canSubmit} />
      )}
    </div>
  );
}

function StudentTaskSubmission({
  taskId,
  canSubmit,
}: {
  taskId: Id<"courseTasks">;
  canSubmit: boolean;
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
          <p className="min-w-0 leading-relaxed">{t("replacementWarning")}</p>
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
    <section className="min-w-0 space-y-4 border-t pt-4">
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
        <div className="min-w-0 space-y-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Paperclip className="size-4 text-primary" aria-hidden="true" />
                {t("submissionFiles")}
              </h4>
              <Badge className="min-w-6 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                {submission.files.length}
              </Badge>
            </div>
            <TaskAttachmentList files={submission.files} plain />
          </div>
          {submission.feedback && (
            <div className="flex max-w-2xl min-w-0 items-start gap-3 rounded-2xl rounded-tl-sm bg-primary/5 px-4 py-3">
              <MessageSquareText
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-primary">
                  {t("teacherFeedback")}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                  {submission.feedback.text}
                </p>
              </div>
            </div>
          )}
        </div>
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
    </section>
  );
}

function TeacherTaskSubmissions({
  taskId,
  timeZone,
}: {
  taskId: Id<"courseTasks">;
  timeZone: string;
}) {
  const t = useTranslations("courseTasks");
  const common = useTranslations("common");
  const format = useFormatter();
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseTaskSubmissions.listForTask,
    { taskId },
    { initialNumItems: 20 },
  );
  const [selectedStudent, setSelectedStudent] = useState<{
    id: Id<"users">;
    name: string;
  }>();
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
      {
        id: "actions",
        header: () => <div className="text-right">{common("actions")}</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={row.original.submittedAt === undefined}
              onClick={() =>
                setSelectedStudent({
                  id: row.original.studentId,
                  name: row.original.studentName,
                })
              }
            >
              {t("review")}
            </Button>
          </div>
        ),
      },
    ],
    [common, format, t, timeZone],
  );

  return (
    <section className="space-y-3 border-t pt-4">
      <h4 className="font-semibold">{t("submissions")}</h4>
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
      {selectedStudent && (
        <TeacherSubmissionReview
          key={selectedStudent.id}
          taskId={taskId}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          timeZone={timeZone}
          onClose={() => setSelectedStudent(undefined)}
        />
      )}
    </section>
  );
}

function TeacherSubmissionReview({
  taskId,
  studentId,
  studentName,
  timeZone,
  onClose,
}: {
  taskId: Id<"courseTasks">;
  studentId: Id<"users">;
  studentName: string;
  timeZone: string;
  onClose: () => void;
}) {
  const t = useTranslations("courseTasks");
  const format = useFormatter();
  const isMobile = useIsMobile();
  const submission = useQuery(api.courseTaskSubmissions.get, {
    taskId,
    studentId,
  });
  const setFeedback = useMutation(api.courseTaskSubmissions.setFeedback);
  const [feedback, setFeedbackText] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savedFeedback = submission?.feedback?.text ?? "";
  const currentFeedback = feedback ?? savedFeedback;
  const hasChanges = currentFeedback.trim() !== savedFeedback.trim();
  const canSaveFeedback =
    hasChanges && (Boolean(currentFeedback.trim()) || Boolean(savedFeedback));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission || saving || !canSaveFeedback) return;
    setSaving(true);
    try {
      await setFeedback({
        taskId,
        studentId,
        text: currentFeedback.trim() || null,
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
          "w-full gap-0 overflow-hidden p-0",
          isMobile
            ? "h-[90dvh] max-h-[90dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            : "sm:max-w-lg",
        )}
      >
        <SheetHeader className="shrink-0 gap-3 pb-4 pl-4 pr-12 pt-6 text-left sm:pl-6">
          <SheetTitle className="break-words text-xl font-bold tracking-tight [overflow-wrap:anywhere]">
            {studentName}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("reviewDescription")}
          </SheetDescription>
          {submission !== undefined && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              <Badge
                variant={submission.submittedLate ? "outline" : "active"}
                className={
                  submission.submittedLate
                    ? "border-warning/40 bg-warning/15 text-warning-foreground"
                    : undefined
                }
              >
                {t(submission.submittedLate ? "late" : "delivered")}
              </Badge>
              {submission.submittedAt !== undefined && (
                <span>
                  {format.dateTime(submission.submittedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone,
                  })}
                </span>
              )}
            </div>
          )}
        </SheetHeader>
        {submission === undefined ? (
          <div className="px-4 py-2 sm:px-6">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-2 sm:px-6">
            <section className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex items-center gap-2 font-semibold text-foreground">
                  <Paperclip
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  {t("submissionFiles")}
                </h3>
                <Badge className="min-w-6 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                  {submission.files.length}
                </Badge>
              </div>
              <TaskAttachmentList files={submission.files} plain />
            </section>

            <form onSubmit={(event) => void save(event)} className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="task-feedback"
                  className="flex items-center gap-2 font-semibold text-foreground"
                >
                  <MessageSquareText
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  {t("feedback")}
                </label>
                <p className="text-sm text-muted-foreground">
                  {hasChanges
                    ? t("feedbackUnsaved")
                    : submission.feedback
                      ? t("feedbackSentAt", {
                          date: format.dateTime(submission.feedback.updatedAt, {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone,
                          }),
                        })
                      : t("feedbackNotSent")}
                </p>
              </div>
              <Textarea
                id="task-feedback"
                maxLength={2000}
                rows={5}
                value={currentFeedback}
                onChange={(event) => setFeedbackText(event.target.value)}
                disabled={saving}
                placeholder={t("feedbackPlaceholder")}
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
