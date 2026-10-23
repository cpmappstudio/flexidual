"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
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
    if (!completed && !leaving) return;
    if (completed) toast.success(t("saved"));
    if (onClose) onClose();
    else router.replace(submissionHref);
  }, [completed, leaving, onClose, submissionHref, router, t]);

  function requestClose() {
    if (saving) return;
    if (unsaved) setCloseRequested(true);
    else setLeaving(true);
  }
  const blocked = completed || saving || Boolean(pending) || conflict;

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
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b pb-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
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
              {document && (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-sm leading-normal">
                  <dt className="text-muted-foreground">
                    {t("studentLabel")}:
                  </dt>
                  <dd className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">
                    {document.studentName}
                  </dd>
                  <dt className="text-muted-foreground">
                    {t("assignmentLabel")}:
                  </dt>
                  <dd className="min-w-0 break-words [overflow-wrap:anywhere]">
                    {document.taskTitle}
                  </dd>
                  <dt className="text-muted-foreground">{t("courseLabel")}:</dt>
                  <dd className="min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]">
                    {document.courseName}
                  </dd>
                </dl>
              )}
            </ItemContent>
          </Item>
          {document && (
            <div className="col-span-2 flex min-w-0 flex-col items-end gap-1.5 justify-self-end lg:col-span-1 lg:col-start-2 lg:row-start-1">
              <ButtonGroup aria-label={t("fileActions")}>
                {editing ? (
                  <Button
                    size="sm"
                    className="pointer-coarse:min-h-11"
                    aria-describedby={saveDescriptionId}
                    disabled={
                      !ready ||
                      completed ||
                      saving ||
                      conflict ||
                      (!dirty && !pending)
                    }
                    onClick={() => void correction.save()}
                  >
                    {saving ? (
                      <Spinner aria-hidden="true" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {t(
                      saving
                        ? "saving"
                        : pending
                          ? "retrySave"
                          : "saveAndReturn",
                    )}
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
                      size="icon-sm"
                      className="pointer-coarse:size-11"
                      aria-label={t("fileActions")}
                      disabled={!ready || saving || completed}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="min-h-11"
                      onSelect={() => void correction.downloadCopy()}
                    >
                      <Download className="size-4" />
                      {editing ? t("downloadCopy") : previewT("download")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
              {editing && (
                <p
                  id={saveDescriptionId}
                  className="flex items-center justify-end gap-1.5 whitespace-nowrap text-xs leading-normal text-muted-foreground"
                >
                  <Info className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("replacementNotice")}
                </p>
              )}
            </div>
          )}
          <div className="col-start-2 row-start-1 flex shrink-0 gap-1 lg:col-start-3 lg:border-l lg:pl-3">
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
              disabled={saving}
              onClick={requestClose}
            >
              <X className="size-4" />
            </Button>
          </div>
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
