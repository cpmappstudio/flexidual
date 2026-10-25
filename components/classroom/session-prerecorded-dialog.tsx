"use client";

import { useEffect, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, PlayCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SessionLessonPicker } from "./session-lesson-picker";
import { ScheduleRecordingPlayer } from "@/components/recording-player-modal";
import {
  readSessionVideoDuration,
  uploadClassSessionVideo,
} from "@/lib/upload-class-session-video";
import { validSessionVideo } from "@/lib/class-session-video";
import { getErrorMessage, parseConvexError } from "@/lib/error-utils";

export default function SessionPrerecordedDialog({
  scheduleId,
  onOpenChange,
}: {
  scheduleId: Id<"classSchedule">;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const client = useConvex();
  const context = useQuery(api.classSessionVideos.getManagementContext, {
    scheduleId,
  });
  const [file, setFile] = useState<File>();
  const [selected, setSelected] = useState<Set<Id<"lessons">>>();
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState(false);
  const controller = useRef<AbortController>(null);
  const mounted = useRef(true);
  const savedLessons = new Set(
    context?.lessons
      .filter((lesson) => lesson.selected)
      .map((lesson) => lesson.lessonId),
  );
  const selectedLessons = selected ?? savedLessons;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (context === null) controller.current?.abort();
  }, [context]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function upload() {
    if (!file || !context || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setFinalizing(false);
    setError(undefined);
    setProgress(0);
    setPreview(false);
    try {
      if (
        !validSessionVideo({
          name: file.name,
          contentType: file.type,
          size: file.size,
          durationMs: 1,
        })
      )
        throw new Error("INVALID_SESSION_VIDEO");
      const durationMs = await readSessionVideoDuration(file, abort.signal);
      abort.signal.throwIfAborted();
      await uploadClassSessionVideo(client, {
        scheduleId,
        file,
        durationMs,
        lessonIds: context.lessons
          .filter((lesson) => selectedLessons.has(lesson.lessonId))
          .map((lesson) => lesson.lessonId),
        signal: abort.signal,
        onProgress: ({ loaded, total }) => {
          if (mounted.current) setProgress((loaded / total) * 100);
        },
        onFinalizing: () => {
          if (mounted.current) setFinalizing(true);
        },
      });
      if (mounted.current) {
        toast.success(t("sessionVideo.saved"));
        onOpenChange(false);
      }
    } catch (cause) {
      if (mounted.current && !abort.signal.aborted) {
        const parsed = parseConvexError(cause);
        setError(
          cause instanceof Error && cause.message === "INVALID_SESSION_VIDEO"
            ? t("sessionVideo.invalidFile")
            : parsed
              ? getErrorMessage(parsed, t, locale)
              : t("errors.operationFailed"),
        );
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
        setFinalizing(false);
      }
      controller.current = null;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>{t("sessionVideo.title")}</DialogTitle>
          <DialogDescription>{t("sessionVideo.description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
          {context === undefined ? (
            <Loader2
              className="mx-auto size-5 animate-spin"
              aria-label={t("common.loading")}
            />
          ) : !context ? (
            <p role="alert">{t("sessionVideo.unavailable")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {context.timeZone
                  ? t("sessionVideo.releaseAt", {
                      date: new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: context.timeZone,
                      }).format(context.scheduledStart),
                    })
                  : t("sessionVideo.releaseAtStart")}
              </p>
              {context.video && (
                <section className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">
                      {context.video.name}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setPreview(!preview)}
                    >
                      <PlayCircle className="size-4" />
                      {t(
                        preview
                          ? "sessionVideo.hidePreview"
                          : "sessionVideo.preview",
                      )}
                    </Button>
                  </div>
                  {preview && (
                    <ScheduleRecordingPlayer
                      scheduleId={scheduleId}
                      recordings={[
                        {
                          _id: context.video.id,
                          prerecordedVideoId: context.video.id,
                          url: null,
                          durationMs: context.video.durationMs,
                          startedAt: context.scheduledStart,
                        },
                      ]}
                    />
                  )}
                </section>
              )}
              <div className="space-y-2">
                <Label htmlFor={`video-${scheduleId}`}>
                  {t(
                    context.video
                      ? "sessionVideo.replace"
                      : "sessionVideo.file",
                  )}
                </Label>
                <Input
                  id={`video-${scheduleId}`}
                  type="file"
                  accept="video/mp4,.mp4"
                  disabled={busy}
                  onChange={(event) => {
                    setFile(event.target.files?.[0]);
                    setError(undefined);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {t("sessionVideo.fileHint")}
                </p>
              </div>
              <SessionLessonPicker
                lessons={context.lessons}
                selectedLessons={selectedLessons}
                onSelectedLessonsChange={setSelected}
                disabled={busy}
              />
            </>
          )}
          {busy && (
            <div className="space-y-2" role="status">
              <Progress
                value={progress}
                aria-label={t("sessionVideo.uploading")}
              />
              <p className="text-sm text-muted-foreground">
                {t(
                  progress >= 100
                    ? "sessionVideo.processing"
                    : "sessionVideo.uploading",
                )}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={busy && finalizing}
            onClick={() => {
              if (busy) controller.current?.abort();
              else onOpenChange(false);
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!context || !file || busy}
            onClick={() => void upload()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {t("sessionVideo.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
