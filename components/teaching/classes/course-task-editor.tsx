"use client";

import { useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_TASK_MATERIAL_FILES,
  validTaskFileSet,
} from "@/lib/course-task-files";
import { localDateTimeToUtc, utcToLocalDateTime } from "@/lib/time-zone";
import {
  TaskAttachmentList,
  TaskFileUploadError,
  TaskFilePicker,
  TaskFileUploadStatus,
  uploadTaskFiles,
  useTaskFileUploadErrorMessage,
  useTaskFileRequest,
  type TaskAttachment,
} from "./course-task-attachments";

export function CourseTaskEditor({
  classId,
  task,
  materials,
  timeZone,
  onClose,
  onSaved,
}: {
  classId: Id<"classes">;
  task?: Doc<"courseTasks">;
  materials: TaskAttachment[];
  timeZone: string;
  onClose: () => void;
  onSaved: (id: Id<"courseTasks">) => void;
}) {
  const t = useTranslations("courseTasks");
  const format = useFormatter();
  const convex = useConvex();
  const request = useTaskFileRequest();
  const create = useMutation(api.courseTasks.create);
  const update = useMutation(api.courseTasks.update);
  const publish = useMutation(api.courseTasks.publish);
  const discardUnpublished = useMutation(api.courseTasks.discardUnpublished);
  const cancelStaged = useMutation(api.courseTaskFiles.cancelStaged);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [availableAt, setAvailableAt] = useState(
    task?.availableAt ? utcToLocalDateTime(task.availableAt, timeZone) : "",
  );
  const [dueAt, setDueAt] = useState(
    task?.dueAt ? utcToLocalDateTime(task.dueAt, timeZone) : "",
  );
  const [allowLate, setAllowLate] = useState(
    task?.dueAt === undefined ? false : task.allowLateSubmissions,
  );
  const [existing, setExisting] = useState(materials);
  const [files, setFiles] = useState<File[]>([]);
  const [attemptId, setAttemptId] = useState<Id<"courseTasks">>();
  const [saving, setSaving] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [formError, setFormError] = useState<string>();
  const [previewDeadlineAt, setPreviewDeadlineAt] = useState<number>();
  const uploadErrorMessage = useTaskFileUploadErrorMessage();

  function saveErrorMessage(error: unknown) {
    const code =
      error &&
      typeof error === "object" &&
      "data" in error &&
      typeof error.data === "string"
        ? error.data
        : error instanceof Error
          ? error.message
          : "";
    if (
      code.includes("INVALID_TASK_DATES") ||
      code.includes("TASK_RELEASE_FAILED")
    )
      return t("invalidDates");
    if (code.includes("COURSE_CLOSED")) return t("courseClosedError");
    if (code.includes("INVALID_TASK_FILES")) return t("materialsUnavailable");
    return t("saveError");
  }

  function creationSuccessMessage(start: number | undefined) {
    return t(
      start !== undefined && start > Date.now() ? "scheduled" : "created",
    );
  }

  function formatDeadline(value: number) {
    return format.dateTime(value, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    });
  }

  async function save(confirmed = false) {
    if (saving) return;
    setFormError(undefined);
    if (!title.trim()) {
      setPreviewDeadlineAt(undefined);
      setFormError(t("titleRequired"));
      return;
    }
    if (!validTaskFileSet([...existing, ...files], MAX_TASK_MATERIAL_FILES)) {
      setPreviewDeadlineAt(undefined);
      setFormError(t("invalidFileSet"));
      return;
    }
    let start: number | undefined;
    let deadline: number | undefined;
    try {
      start = availableAt
        ? localDateTimeToUtc(availableAt, timeZone)
        : undefined;
      deadline = dueAt ? localDateTimeToUtc(dueAt, timeZone) : undefined;
      const effectiveStart = task?.releasedAt ?? start;
      if (
        (task?.releasedAt === undefined &&
          start !== undefined &&
          start <= Date.now()) ||
        (effectiveStart !== undefined &&
          deadline !== undefined &&
          deadline <= effectiveStart) ||
        (deadline !== undefined &&
          deadline <= Date.now() &&
          task?.releasedAt === undefined)
      )
        throw new Error("INVALID_TASK_DATES");
    } catch {
      setPreviewDeadlineAt(undefined);
      setFormError(t("invalidDates"));
      return;
    }
    if (
      !confirmed &&
      task?.releasedAt !== undefined &&
      deadline !== undefined &&
      (task.dueAt === undefined || deadline < task.dueAt)
    ) {
      setSaving(true);
      try {
        const preview = await convex.query(
          api.courseTasks.previewDeadlineChange,
          {
            taskId: task._id,
          },
        );
        if (preview.hasSubmissions) {
          setPreviewDeadlineAt(deadline);
          setSaving(false);
          return;
        }
      } catch (error) {
        setSaving(false);
        setFormError(saveErrorMessage(error));
        return;
      }
    }
    setPreviewDeadlineAt(undefined);
    setSaving(true);
    setUploaded(0);
    const stagedIds: Id<"courseTaskFiles">[] = [];
    let currentAttemptId = attemptId;
    try {
      if (!task && currentAttemptId) {
        const result = await discardUnpublished({ taskId: currentAttemptId });
        if (result === "published") {
          toast.success(creationSuccessMessage(start));
          onSaved(currentAttemptId);
          return;
        }
        currentAttemptId = undefined;
        setAttemptId(undefined);
      }
      let id = task?._id;
      if (!id) {
        id = await create({
          classId,
          title: title.trim(),
          description: description.trim() || undefined,
          availableAt: start,
          dueAt: deadline,
          allowLateSubmissions: deadline === undefined ? true : allowLate,
          draft: true,
        });
        setAttemptId(id);
        currentAttemptId = id;
      }
      const added = await uploadTaskFiles(
        files,
        id,
        "material",
        request,
        setUploaded,
        (fileId) => stagedIds.push(fileId),
      );
      const materialFileIds = [...existing.map((file) => file.id), ...added];
      if (!task) {
        await publish({ taskId: id, materialFileIds });
      } else {
        await update({
          taskId: id,
          title: title.trim(),
          description: description.trim() || null,
          availableAt:
            task.releasedAt === undefined ? (start ?? null) : undefined,
          dueAt: deadline ?? null,
          allowLateSubmissions: deadline === undefined ? true : allowLate,
          materialFileIds,
        });
      }
      toast.success(task ? t("updated") : creationSuccessMessage(start));
      onSaved(id);
    } catch (error) {
      await Promise.allSettled(stagedIds.map((id) => cancelStaged({ id })));
      if (!task && currentAttemptId) {
        try {
          const result = await discardUnpublished({ taskId: currentAttemptId });
          if (result === "published") {
            toast.success(creationSuccessMessage(start));
            onSaved(currentAttemptId);
            return;
          }
          setAttemptId(undefined);
        } catch {
          setFormError(t("publicationUnconfirmed"));
          return;
        }
      }
      setFormError(
        error instanceof TaskFileUploadError
          ? uploadErrorMessage(error)
          : saveErrorMessage(error),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !saving && previewDeadlineAt === undefined) onClose();
        }}
      >
        <DialogContent
          className="max-h-[90vh] min-w-0 overflow-y-auto sm:max-w-2xl"
          showCloseButton={!saving}
        >
          <DialogHeader>
            <DialogTitle>{t(task ? "editTask" : "newTask")}</DialogTitle>
            <DialogDescription>{t("editorDescription")}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            className="min-w-0 space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="task-title">
                {t("title")}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="task-title"
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">{t("description")}</Label>
              <Textarea
                id="task-description"
                value={description}
                maxLength={10_000}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                disabled={saving}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {task?.releasedAt === undefined ? (
                  <>
                    <Label htmlFor="task-start">{t("availableAt")}</Label>
                    <Input
                      id="task-start"
                      type="datetime-local"
                      value={availableAt}
                      onChange={(event) => setAvailableAt(event.target.value)}
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        availableAt
                          ? "scheduledStartHint"
                          : "immediateStartHint",
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <Label>{t("availableFrom")}</Label>
                    <p className="py-2 text-sm font-medium">
                      {formatDeadline(task.releasedAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("releasedStartHint")}
                    </p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due">{t("dueAt")}</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  {t(dueAt ? "deadlineHint" : "noDeadlineHint")}
                </p>
              </div>
            </div>
            {dueAt && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={allowLate}
                  onCheckedChange={(checked) => setAllowLate(checked === true)}
                  disabled={saving}
                />
                <span>{t("allowLate")}</span>
              </label>
            )}
            <div className="min-w-0 space-y-2">
              <Label>{t("inputMaterials")}</Label>
              {existing.length > 0 && (
                <TaskAttachmentList
                  files={existing}
                  onRemove={(id) =>
                    setExisting((current) =>
                      current.filter((file) => file.id !== id),
                    )
                  }
                  disabled={saving}
                />
              )}
              <TaskFilePicker
                files={files}
                onChange={setFiles}
                maxFiles={MAX_TASK_MATERIAL_FILES - existing.length}
                existingBytes={existing.reduce(
                  (total, file) => total + file.size,
                  0,
                )}
                disabled={saving}
              />
            </div>
            {saving && files.length > 0 && (
              <TaskFileUploadStatus completed={uploaded} total={files.length} />
            )}
            {formError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner aria-hidden="true" />}
                {t(
                  task
                    ? task.releasedAt === undefined && !availableAt
                      ? "publish"
                      : "save"
                    : availableAt &&
                        availableAt > utcToLocalDateTime(Date.now(), timeZone)
                      ? "scheduleTask"
                      : "publish",
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={previewDeadlineAt !== undefined}
        onOpenChange={(open) => {
          if (!open && !saving) setPreviewDeadlineAt(undefined);
        }}
      >
        <AlertDialogContent className="max-h-[90svh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deadlineChangeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deadlineChangeStatusesStay")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("deadlineChangeCurrent")}
                </p>
                <p className="font-medium">
                  {task?.dueAt === undefined
                    ? t("noDeadline")
                    : formatDeadline(task.dueAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("deadlineChangeNew")}
                </p>
                <p className="font-semibold text-primary">
                  {previewDeadlineAt === undefined
                    ? ""
                    : formatDeadline(previewDeadlineAt)}
                </p>
              </div>
            </div>
            {(task?.manuallyClosedAt !== undefined ||
              (previewDeadlineAt !== undefined &&
                previewDeadlineAt <= Date.now())) && (
              <p className="text-muted-foreground">
                {task?.manuallyClosedAt !== undefined
                  ? t("deadlineChangeAlreadyClosed")
                  : t(
                      allowLate
                        ? "deadlineChangeLateNow"
                        : "deadlineChangeClosesNow",
                    )}
              </p>
            )}
          </div>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto" disabled={saving}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => void save(true)}
            >
              {t("deadlineChangeConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
