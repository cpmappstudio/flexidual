"use client";

import {
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  MonitorCog,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClassroomPresentation } from "./classroom-presentation";
import { ClassroomWindowControls } from "./classroom-window-controls";

interface ClassroomDisplayControlsProps {
  zoom: number;
  onZoom?: (delta: number) => void;
  isWhiteboardActive: boolean;
  followViewport: boolean;
  onToggleFollowViewport: () => void;
  followingLabel: string;
  unlockedLabel: string;
  isFullscreen: boolean;
  onToggleFullscreen?: () => void;
  enterFullscreenLabel: string;
  exitFullscreenLabel: string;
}

export function ClassroomDisplayControls({
  zoom,
  onZoom,
  isWhiteboardActive,
  followViewport,
  onToggleFollowViewport,
  followingLabel,
  unlockedLabel,
  isFullscreen,
  onToggleFullscreen,
  enterFullscreenLabel,
  exitFullscreenLabel,
}: ClassroomDisplayControlsProps) {
  const t = useTranslations("classroom");
  const presentation = useClassroomPresentation();
  const [open, setOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const controlsId = useId();
  const ownerWindow = presentation?.ownerWindow;

  useEffect(() => {
    if (!open) return;
    const ownerDocument = controlsRef.current?.ownerDocument;
    if (!ownerDocument) return;
    const dismiss = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setOpen(false);
    };
    ownerDocument.addEventListener("pointerdown", dismiss);
    return () => ownerDocument.removeEventListener("pointerdown", dismiss);
  }, [open, ownerWindow]);

  const hasWindowControls = Boolean(presentation?.enabled);
  const hasContentControls = Boolean(onZoom || isWhiteboardActive);
  if (!hasContentControls && !onToggleFullscreen && !hasWindowControls)
    return null;

  const fullscreenLabel = isFullscreen
    ? exitFullscreenLabel
    : enterFullscreenLabel;
  const followLabel = followViewport ? followingLabel : unlockedLabel;

  return (
    <div
      ref={controlsRef}
      role="group"
      aria-label={t("displayControls")}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        if (
          !event.currentTarget.contains(
            event.currentTarget.ownerDocument.activeElement,
          )
        )
          setOpen(false);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        event.preventDefault();
        triggerRef.current?.focus();
        setOpen(false);
      }}
      className={cn(
        "absolute right-1.5 top-1.5 z-40 flex max-w-[calc(100%_-_0.75rem)] items-center justify-end gap-0.5 text-foreground @min-[600px]:right-2 @min-[600px]:top-2 @min-[600px]:gap-1",
        open &&
          "rounded-lg border border-border/50 bg-background/80 p-0.5 shadow-sm backdrop-blur-sm @min-[600px]:p-1",
      )}
    >
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        className="order-last size-11 shrink-0 rounded-full p-0 hover:bg-transparent @min-[600px]:size-9"
        aria-label={t("displayControls")}
        title={t("displayControls")}
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={() => setOpen(!open)}
      >
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full @min-[600px]:size-9",
            !open &&
              "border border-border/50 bg-background/70 shadow-sm backdrop-blur-sm",
          )}
        >
          <MonitorCog className="size-4 @min-[600px]:size-4.5" />
        </span>
      </Button>
      <div
        id={controlsId}
        hidden={!open}
        className={
          open
            ? "flex min-w-0 flex-wrap items-center justify-end gap-0.5 [&_button]:min-h-10 [&_button]:min-w-10 [&_button]:px-1 @min-[600px]:gap-1 @min-[600px]:[&_button]:min-h-9 @min-[600px]:[&_button]:min-w-9 @min-[600px]:[&_button]:px-2.5"
            : "hidden"
        }
      >
        {onZoom && (
          <div
            role="group"
            aria-label={t("zoomControls")}
            className="flex shrink-0 items-center gap-0.5"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onZoom(-0.25)}
              disabled={zoom <= 1}
              title={t("zoomOut")}
              aria-label={t("zoomOut")}
            >
              <ZoomOut className="size-4" />
            </Button>
            <span
              className="min-w-[4ch] text-center font-mono text-[11px] tabular-nums @min-[600px]:text-xs"
              aria-live="polite"
              aria-atomic="true"
            >
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onZoom(0.25)}
              disabled={zoom >= 3}
              title={t("zoomIn")}
              aria-label={t("zoomIn")}
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>
        )}
        {isWhiteboardActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFollowViewport}
            aria-pressed={followViewport}
            title={followLabel}
            aria-label={followLabel}
          >
            {followViewport ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )}
            <span className="hidden @min-[600px]:inline">{followLabel}</span>
          </Button>
        )}
        {hasContentControls && (onToggleFullscreen || hasWindowControls) && (
          <span
            aria-hidden="true"
            className="mx-1 h-5 w-px shrink-0 bg-border"
          />
        )}
        {onToggleFullscreen && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFullscreen}
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
            <span className="hidden @min-[600px]:inline">
              {fullscreenLabel}
            </span>
          </Button>
        )}
        <ClassroomWindowControls compact={presentation?.mode === "compact"} />
      </div>
    </div>
  );
}
