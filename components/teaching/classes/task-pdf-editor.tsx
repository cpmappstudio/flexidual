"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ChevronDown,
  Download,
  FileText,
  Info,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import { Spinner } from "@/components/ui/spinner";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import { useTaskPdfCorrection } from "@/hooks/use-task-pdf-correction";
import { GradeEditor, type GradeActions } from "./course-task-grade";

const TaskPdfViewer = dynamic(() => import("./task-pdf-viewer"), {
  ssr: false,
});

export function TaskPdfEditor({
  fileId,
  initialEditing = true,
  onClose,
  returnFocus,
}: {
  fileId: string;
  initialEditing?: boolean;
  onClose?: () => void;
  returnFocus?: HTMLButtonElement;
}) {
  const t = useTranslations("courseTasks.pdfCorrection");
  const previewT = useTranslations("filePreview");
  const saveDescriptionId = useId();
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const correction = useTaskPdfCorrection(fileId);
  const {
    document,
    latest,
    url,
    loadFailed,
    ready,
    dirty,
    saving,
    pending,
    saveError,
    completed,
    conflict,
  } = correction;
  const [editing, setEditing] = useState(initialEditing);
  const [expanded, setExpanded] = useState(initialEditing);
  const [leaving, setLeaving] = useState(false);
  const [closeRequested, setCloseRequested] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const grade = useQuery(
    api.courseTaskGrades.get,
    document && editing
      ? { taskId: document.taskId, studentId: document.studentId }
      : "skip",
  );
  const gradeForEditing = editing && grade?.grading ? grade : null;
  const unsaved =
    !completed && !leaving && (dirty || Boolean(pending) || saving);
  const submissionHref = document
    ? ROUTES.org.taskSubmission(
        orgSlug,
        document.classId,
        document.taskId,
        document.studentId,
      )
    : ROUTES.org.root(orgSlug);

  // shortcut: internal browser navigation is unguarded; add draft recovery if needed.
  useEffect(() => {
    if (!unsaved) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [unsaved]);

  useEffect(() => {
    if (!leaving) return;
    if (completed) toast.success(t("saved"));
    if (onClose) onClose();
    else router.replace(submissionHref);
  }, [completed, leaving, onClose, submissionHref, router, t]);

  function requestClose() {
    if (saving || publishing) return;
    if (unsaved) setCloseRequested(true);
    else setLeaving(true);
  }
  const blocked = completed || saving || Boolean(pending) || conflict;
  const hasPdfChanges = dirty || Boolean(pending);
  const canSavePdf =
    ready && !completed && !saving && !conflict && hasPdfChanges;

  async function saveAndReturn() {
    if (await correction.save()) setLeaving(true);
  }

  async function saveAndPublish(actions: GradeActions) {
    setPublishing(true);
    try {
      if (
        await actions.publish(
          async () => !hasPdfChanges || (await correction.save()),
        )
      )
        setLeaving(true);
    } finally {
      setPublishing(false);
    }
  }

  async function keepGradeDraft(actions: GradeActions) {
    if (actions.canSave && !(await actions.saveDraft())) return;
    if (!hasPdfChanges) setLeaving(true);
  }

  function fileActions(actions?: GradeActions) {
    const saveLabel = t(
      saving || publishing
        ? "saving"
        : actions
          ? "saveAndPublish"
          : pending
            ? "retrySave"
            : "saveAndReturn",
    );
    return (
      <>
        <ButtonGroup
          aria-label={t("fileActions")}
          className={actions ? "max-lg:w-full" : undefined}
        >
          {editing ? (
            <Button
              type="button"
              size="sm"
              className={
                actions
                  ? "max-lg:flex-1 pointer-coarse:min-h-11"
                  : "pointer-coarse:min-h-11"
              }
              aria-label={saveLabel}
              aria-describedby={hasPdfChanges ? saveDescriptionId : undefined}
              disabled={
                actions
                  ? publishing ||
                    conflict ||
                    !actions.canPublish ||
                    (hasPdfChanges && !canSavePdf)
                  : !canSavePdf
              }
              onClick={() =>
                void (actions ? saveAndPublish(actions) : saveAndReturn())
              }
            >
              {saving || publishing ? (
                <Spinner aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              <span className={actions ? "hidden lg:inline" : undefined}>
                {saveLabel}
              </span>
            </Button>
          ) : (
            <Button
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={!ready || conflict}
              onClick={() => {
                setEditing(true);
                setExpanded(true);
              }}
            >
              <Pencil className="size-4" />
              {t("edit")}
            </Button>
          )}
          <ButtonGroupSeparator className="bg-primary-foreground/25" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                className={
                  actions
                    ? "max-lg:w-11 pointer-coarse:size-11"
                    : "pointer-coarse:size-11"
                }
                aria-label={t("fileActions")}
                disabled={
                  actions ? saving || publishing : !ready || saving || completed
                }
              >
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions && (
                <>
                  <DropdownMenuItem
                    className="min-h-11"
                    disabled={
                      actions.busy ||
                      (!actions.canSave &&
                        (!actions.canPublish || hasPdfChanges))
                    }
                    onSelect={() => void keepGradeDraft(actions)}
                  >
                    {t("saveGradeDraft")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-11"
                    disabled={!canSavePdf || actions.busy}
                    onSelect={() => void saveAndReturn()}
                  >
                    {t("savePdfOnly")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className="min-h-11"
                disabled={!ready || completed}
                onSelect={() => void correction.downloadCopy()}
              >
                <Download className="size-4" />
                {editing ? t("downloadCopy") : previewT("download")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        {editing && hasPdfChanges && (
          <p
            id={saveDescriptionId}
            className="flex items-center gap-1.5 text-xs leading-normal text-muted-foreground lg:justify-end"
          >
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            {t("replacementNotice")}
          </p>
        )}
      </>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          if (returnFocus?.isConnected) {
            event.preventDefault();
            returnFocus.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (closeRequested) event.preventDefault();
        }}
        className={`flex min-w-0 flex-col gap-3 overflow-hidden p-3 sm:p-4 ${
          expanded
            ? "h-dvh w-screen max-w-none rounded-none border-0 sm:max-w-none"
            : "h-[min(90dvh,900px)] w-[calc(100vw-1rem)] max-w-none sm:w-[min(90vw,1100px)] sm:max-w-none"
        }`}
      >
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b pb-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <Item className="min-w-0 flex-nowrap items-start gap-3 rounded-none border-0 p-0">
            <ItemMedia className="mt-0.5 text-primary" aria-hidden="true">
              <FileText className="size-5 sm:size-6" />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="min-w-0 break-words text-base font-semibold leading-snug [overflow-wrap:anywhere]">
                  {document?.name ?? t("loading")}
                </DialogTitle>
                {document && editing && (
                  <div role="status" aria-atomic="true">
                    {saving ? (
                      <span className="sr-only">{t("saving")}</span>
                    ) : !completed ? (
                      <Badge
                        variant={dirty || pending ? "secondary" : "inactive"}
                        className="max-w-full whitespace-normal"
                      >
                        {t(
                          pending
                            ? "saveUnconfirmed"
                            : dirty
                              ? "unsavedChanges"
                              : "noChanges",
                        )}
                      </Badge>
                    ) : null}
                  </div>
                )}
              </div>
            </ItemContent>
          </Item>
          {document && (
            <dl
              className={`col-start-1 row-start-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-sm leading-normal ${gradeForEditing ? "" : "max-lg:col-span-2"}`}
            >
              <dt className="text-muted-foreground">{t("studentLabel")}:</dt>
              <dd className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">
                {document.studentName}
              </dd>
              <dt className="text-muted-foreground">{t("assignmentLabel")}:</dt>
              <dd className="min-w-0 break-words [overflow-wrap:anywhere]">
                {document.taskTitle}
              </dd>
              <dt className="text-muted-foreground">{t("courseLabel")}:</dt>
              <dd className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">
                {document.courseName}
              </dd>
            </dl>
          )}
          <div className="col-start-2 row-start-1 flex shrink-0 gap-1 justify-self-end lg:col-start-3 lg:border-l lg:pl-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t(expanded ? "restoreViewer" : "expandViewer")}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t("backToSubmission")}
              disabled={saving || publishing}
              onClick={requestClose}
            >
              <X className="size-4" />
            </Button>
          </div>
          {document && (
            <div
              className={`flex min-w-0 flex-col items-start gap-1.5 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:items-end ${
                gradeForEditing
                  ? "max-lg:col-start-2 max-lg:row-start-2 max-lg:w-24 max-lg:justify-self-end"
                  : "max-lg:col-span-2 max-lg:row-start-3"
              }`}
            >
              {gradeForEditing ? (
                <GradeEditor
                  taskId={document.taskId}
                  studentId={document.studentId}
                  submissionRevision={document.revision}
                  grade={gradeForEditing}
                  compact
                  renderActions={fileActions}
                />
              ) : (
                fileActions()
              )}
            </div>
          )}
        </header>
        <AlertDialog open={closeRequested} onOpenChange={setCloseRequested}>
          <AlertDialogContent>
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle>{t("leaveTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("leaveUnsaved")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col-reverse sm:flex-row">
              <AlertDialogCancel className="min-h-11">
                {t("keepEditing")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="min-h-11 bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20"
                onClick={() => setLeaving(true)}
              >
                {t("leaveWithoutSaving")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {(conflict || saveError) && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <p>{t(conflict ? "conflict" : saveError!)}</p>
            {conflict && (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={requestClose}
              >
                {t("useCurrentSubmission")}
              </Button>
            )}
          </div>
        )}
        {!document ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
          >
            {latest === undefined ? (
              <>
                <Spinner aria-hidden="true" />
                {t("loading")}
              </>
            ) : (
              t("unavailable")
            )}
          </div>
        ) : loadFailed ? (
          <div role="alert" className="space-y-3 p-6 text-center">
            <p>{t("loadFailed")}</p>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={correction.retryLoad}
            >
              {t("retryLoad")}
            </Button>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
            {!ready && (
              <div
                role="status"
                className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/90"
              >
                <Spinner aria-hidden="true" />
                {t("loading")}
              </div>
            )}
            <div className="absolute inset-0" inert={blocked || undefined}>
              {url && (
                <TaskPdfViewer
                  key={url}
                  src={url}
                  name={document.name}
                  author={document.authorName}
                  readOnly={!editing}
                  viewerRef={correction.viewer}
                  onReady={() => correction.setReady(true)}
                  onChange={() => {
                    if (editing) correction.setDirty(true);
                  }}
                  onError={correction.reportLoadError}
                />
              )}
            </div>
            {saving && (
              <div
                role="status"
                className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-background/60"
              >
                <Spinner aria-hidden="true" />
                {t("saving")}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
