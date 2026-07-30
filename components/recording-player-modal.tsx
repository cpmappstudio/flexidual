"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayCircle, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { TZDate } from "@date-fns/tz";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecordingPlayerProps {
  scheduleId: Id<"classSchedule">;
  title: string;
  secondaryLabel?: string | null;
  gradeLabel?: string | null;
  scheduledStart?: number;
  scheduledEnd?: number;
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "student" | "default";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Inner video player ───────────────────────────────────────────────────────

function VideoPlayer({ url }: { url: string }) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="space-y-3">
      {/* Video container */}
      <div
        className="relative mx-auto max-h-[calc(100dvh-15rem)] w-full overflow-hidden rounded-xl bg-inverse"
        style={{ aspectRatio: "16/9" }}
      >
        {isLoading && !hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-inverse/80">
            <div className="flex flex-col items-center gap-3 text-inverse-foreground/70">
              <PlayCircle className="h-12 w-12 animate-pulse" />
              <span className="text-sm">{t("recordings.loading")}</span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-inverse/90">
            <div className="flex flex-col items-center gap-3 px-6 text-center text-inverse-foreground/70">
              <Video className="h-12 w-12 opacity-50" />
              <p className="text-sm font-medium">{t("recordings.loadError")}</p>
              <p className="text-xs opacity-60">
                {t("recordings.loadErrorHint")}
              </p>
            </div>
          </div>
        )}

        <video
          src={url}
          controls
          preload="metadata"
          className={cn(
            "h-full w-full object-contain",
            (isLoading || hasError) && "opacity-0",
          )}
          onLoadedMetadata={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          onCanPlay={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
}

function RecordingHeader({
  isMobile,
  isStudent,
  title,
  secondaryLabel,
  scheduleLabel,
}: {
  isMobile: boolean;
  isStudent: boolean;
  title: string;
  secondaryLabel?: string | null;
  scheduleLabel: string | null;
}) {
  const headerClassName = cn(
    "relative isolate after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-z-10 after:h-[calc(100%+2rem)] after:bg-gradient-to-b after:content-['']",
    isMobile ? "px-4 pb-4 pt-6" : "px-6 pb-4 pt-5",
    isStudent
      ? "after:from-background after:via-background/80 after:to-background/0"
      : "after:from-card after:via-card/80 after:to-card/0",
  );
  const details = (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 text-muted-foreground",
        !isMobile && "sm:items-start",
      )}
    >
      {secondaryLabel && (
        <span className="truncate text-sm font-medium">{secondaryLabel}</span>
      )}
      {scheduleLabel && (
        <span className="max-w-full truncate text-xs capitalize">
          {scheduleLabel}
        </span>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <SheetHeader className={headerClassName}>
        <SheetTitle className="line-clamp-2 px-10 text-center text-xl font-black leading-tight text-foreground">
          {title}
        </SheetTitle>
        {details}
      </SheetHeader>
    );
  }

  return (
    <DialogHeader className={headerClassName}>
      <DialogTitle className="truncate text-lg font-black leading-tight text-foreground">
        {title}
      </DialogTitle>
      {details}
    </DialogHeader>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function RecordingPlayerModal({
  scheduleId,
  title,
  secondaryLabel,
  gradeLabel,
  scheduledStart,
  scheduledEnd,
  timeZone,
  open,
  onOpenChange,
  variant = "default",
}: RecordingPlayerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const recordings = useQuery(
    api.recordings.getBySchedule,
    open ? { scheduleId } : "skip",
  );

  // Reset selection when modal opens or recording count changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [open, recordings?.length]);

  const isLoading = recordings === undefined;
  const isEmpty = recordings !== undefined && recordings.length === 0;
  const activeRec = recordings
    ? (recordings[selectedIdx] ?? recordings[0])
    : null;

  const isStudent = variant === "student";
  const dateLocale = locale === "es" ? es : locale === "pt-BR" ? ptBR : enUS;
  const scheduledStartDate =
    scheduledStart !== undefined ? new TZDate(scheduledStart, timeZone) : null;
  const scheduledEndDate =
    scheduledEnd !== undefined ? new TZDate(scheduledEnd, timeZone) : null;
  const scheduleLabel = scheduledStartDate
    ? `${format(scheduledStartDate, "EEEE, MMMM d, yyyy", {
        locale: dateLocale,
      })} · ${format(scheduledStartDate, "h:mm a", {
        locale: dateLocale,
      })}${
        scheduledEndDate
          ? ` – ${format(scheduledEndDate, "h:mm a", {
              locale: dateLocale,
            })}`
          : ""
      }`
    : null;
  const displayTitle =
    !isStudent && gradeLabel ? `${title} (${gradeLabel})` : title;

  const content = (
    <div
      className={cn(
        "min-h-0 space-y-2 overflow-hidden",
        isMobile ? "px-4 pb-4" : "px-6",
      )}
    >
      {isLoading && (
        <div className="space-y-3">
          <Skeleton
            className={cn("w-full", isStudent ? "bg-primary/10" : "bg-muted")}
            style={{ aspectRatio: "16/9" }}
          />
          {!isStudent && (
            <Skeleton
              className={cn(
                "h-4 w-32",
                isStudent ? "bg-primary/10" : "bg-muted",
              )}
            />
          )}
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {isStudent ? (
            <Video className="mb-3 h-12 w-12 text-primary" />
          ) : (
            <Video className="mb-3 h-12 w-12 text-muted-foreground" />
          )}
          <p className="font-bold text-foreground">
            {t("recordings.noRecordings")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("recordings.noRecordingsHint")}
          </p>
        </div>
      )}

      {recordings && recordings.length > 0 && (
        <div className="space-y-2">
          {/* Selector — only shown when there are multiple recordings */}
          {recordings.length > 1 && (
            <div
              className={cn(
                "flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1",
                isMobile && "scrollbar-hide pr-8",
              )}
            >
              {recordings.map((rec, idx) => (
                <Button
                  key={rec._id}
                  type="button"
                  size="sm"
                  variant={selectedIdx === idx ? "default" : "outline"}
                  onClick={() => setSelectedIdx(idx)}
                  className={cn(
                    "shrink-0 snap-start gap-2 font-semibold",
                    isStudent ? "rounded-full" : "rounded-lg",
                    isStudent &&
                      selectedIdx !== idx &&
                      "border-primary/30 bg-primary/10 text-primary",
                  )}
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  {t("recordings.part", { number: idx + 1 })}
                  {rec.durationMs && (
                    <span className="opacity-70">
                      · {formatDuration(rec.durationMs)}
                    </span>
                  )}
                </Button>
              ))}
            </div>
          )}

          {/* Active recording player */}
          {activeRec &&
            (activeRec.url ? (
              <VideoPlayer
                key={activeRec._id}
                url={activeRec.url}
              />
            ) : (
              <div
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl border",
                  isStudent
                    ? "bg-primary/5 border-primary/20 text-muted-foreground"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                <Video className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{t("recordings.processing")}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  const header = (
    <RecordingHeader
      isMobile={isMobile}
      isStudent={isStudent}
      title={displayTitle}
      secondaryLabel={secondaryLabel}
      scheduleLabel={scheduleLabel}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "max-h-[90dvh] gap-0 overflow-hidden rounded-t-[2rem] border-x border-t-2 pb-[env(safe-area-inset-bottom)] [&>button]:right-4 [&>button]:top-4 [&>button]:flex [&>button]:size-8 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-md [&>button]:border [&>button]:border-primary/40 [&>button]:bg-background/90 [&>button>svg]:size-4",
            isStudent
              ? "border-primary/30 bg-background"
              : "border-border bg-card",
          )}
        >
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30"
          />
          {header}
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "grid max-h-[calc(100dvh-2rem)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-5xl",
          isStudent
            ? "rounded-2xl border-2 border-primary/30 bg-background"
            : "border-border bg-card",
        )}
        showCloseButton
      >
        {header}
        {content}
      </DialogContent>
    </Dialog>
  );
}
