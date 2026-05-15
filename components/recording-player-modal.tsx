"use client";

import { useRef, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useFullscreen } from "@/hooks/use-fullscreen";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Maximize2,
  Minimize2,
  PlayCircle,
  Video,
  Clock,
  Calendar,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecordingPlayerProps {
  scheduleId: Id<"classSchedule">;
  title: string;
  className?: string;
  scheduledStart?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ─── Inner video player ───────────────────────────────────────────────────────

function VideoPlayer({
  url,
  durationMs,
  fileSize,
  completedAt,
  index,
  total,
}: {
  url: string;
  durationMs: number | null;
  fileSize: number | null;
  completedAt: number | null;
  index: number;
  total: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, isSupported, toggleFullscreen } = useFullscreen();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleFullscreen = useCallback(() => {
    toggleFullscreen(containerRef.current);
  }, [toggleFullscreen]);

  return (
    <div className="space-y-3">
      {total > 1 && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Video className="h-3 w-3 mr-1" />
            Recording {index + 1} of {total}
          </Badge>
          {completedAt && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(completedAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
          )}
        </div>
      )}

      {/* Video container */}
      <div
        ref={containerRef}
        className="relative bg-black rounded-xl overflow-hidden group"
        style={{ aspectRatio: "16/9" }}
      >
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="flex flex-col items-center gap-3 text-white/70">
              <PlayCircle className="h-12 w-12 animate-pulse" />
              <span className="text-sm">Loading recording…</span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
            <div className="flex flex-col items-center gap-3 text-white/70 text-center px-6">
              <Video className="h-12 w-12 opacity-50" />
              <p className="text-sm font-medium">Unable to load recording</p>
              <p className="text-xs opacity-60">
                The file may still be processing or the link may have expired.
              </p>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={url}
          controls
          preload="metadata"
          className={cn(
            "w-full h-full object-contain",
            (isLoading || hasError) && "opacity-0"
          )}
          onLoadedMetadata={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          onCanPlay={() => setIsLoading(false)}
        />

        {/* Fullscreen toggle overlay */}
        {isSupported && !hasError && !isLoading && (
          <button
            onClick={handleFullscreen}
            className="absolute bottom-3 right-3 z-20 bg-black/60 hover:bg-black/80 text-white rounded-md p-1.5 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Metadata strip */}
      {(durationMs || fileSize || completedAt) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {completedAt && total === 1 && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(completedAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
          )}
          {durationMs && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(durationMs)}
            </span>
          )}
          {fileSize && (
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {formatFileSize(fileSize)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function RecordingPlayerModal({
  scheduleId,
  title,
  className,
  scheduledStart,
  open,
  onOpenChange,
}: RecordingPlayerProps) {
  const t = useTranslations();
  const recordings = useQuery(
    api.recordings.getBySchedule,
    open ? { scheduleId } : "skip"
  );

  const isLoading = recordings === undefined;
  const isEmpty = recordings !== undefined && recordings.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl bg-gray-950 border-gray-800 text-white p-0 overflow-hidden"
        showCloseButton
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-gray-800">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Video className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-white text-lg font-bold leading-tight truncate">
                {title}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {className && (
                  <span className="text-sm text-gray-400 truncate">{className}</span>
                )}
                {scheduledStart && (
                  <span className="text-xs text-gray-500">
                    {format(new Date(scheduledStart), "EEEE, MMMM d, yyyy")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="w-full bg-gray-800" style={{ aspectRatio: "16/9" }} />
              <div className="flex gap-3">
                <Skeleton className="h-4 w-32 bg-gray-800" />
                <Skeleton className="h-4 w-24 bg-gray-800" />
              </div>
            </div>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Video className="h-12 w-12 text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">
                {t("recordings.noRecordings") || "No recordings available"}
              </p>
              <p className="text-gray-600 text-sm mt-1">
                {t("recordings.noRecordingsHint") ||
                  "This session may still be processing or was not recorded."}
              </p>
            </div>
          )}

          {recordings && recordings.length > 0 && (
            <div className="space-y-8">
              {recordings.map((rec, idx) =>
                rec.url ? (
                  <VideoPlayer
                    key={rec._id}
                    url={rec.url}
                    durationMs={rec.durationMs}
                    fileSize={rec.fileSize}
                    completedAt={rec.completedAt}
                    index={idx}
                    total={recordings.length}
                  />
                ) : (
                  <div
                    key={rec._id}
                    className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800 text-gray-400"
                  >
                    <Video className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">
                      {t("recordings.processing") || "Recording is still processing…"}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
