"use client";

import { VideoTrack } from "@livekit/components-react";
import {
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import { ClassroomLayoutStage } from "./classroom-layout";
import { SharedWhiteboard } from "./shared-whiteboard";

interface ClassroomStageProps {
  stageRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
  phoneControls: ReactNode;
  isPhoneLandscape: boolean;
  stageControlsVisible: boolean;
  onRevealControls: () => void;
  zoom: number;
  contentActive: boolean;
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

export function ClassroomStage({
  stageRef,
  className,
  children,
  phoneControls,
  isPhoneLandscape,
  stageControlsVisible,
  onRevealControls,
  zoom,
  contentActive,
  isWhiteboardActive,
  followViewport,
  onToggleFollowViewport,
  followingLabel,
  unlockedLabel,
  isFullscreen,
  onToggleFullscreen,
  enterFullscreenLabel,
  exitFullscreenLabel,
}: ClassroomStageProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <ClassroomLayoutStage>
      <div
        ref={stageRef}
        className={cn(
          "group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden",
          className,
        )}
      >
        {(contentActive || (onToggleFullscreen && !isPhoneLandscape)) && (
          <div className="pointer-events-none absolute right-2 top-2 z-30 flex flex-col items-end gap-1.5">
            {isWhiteboardActive && (
              <button
                type="button"
                onClick={onToggleFollowViewport}
                className={cn(
                  "pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-lg transition-all",
                  followViewport
                    ? "border-success/50 bg-success/90 text-success-foreground hover:bg-success/80"
                    : "border-inverse-foreground/20 bg-inverse/60 text-inverse-foreground/80 hover:bg-inverse/80",
                )}
              >
                {followViewport ? (
                  <Eye className="size-3" />
                ) : (
                  <EyeOff className="size-3" />
                )}
                {followViewport ? followingLabel : unlockedLabel}
              </button>
            )}

            {onToggleFullscreen && !isPhoneLandscape && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                title={
                  isFullscreen ? exitFullscreenLabel : enterFullscreenLabel
                }
                className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-inverse-foreground/20 bg-inverse/60 text-inverse-foreground shadow-lg transition-all hover:bg-inverse/80"
              >
                {isFullscreen ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </button>
            )}
          </div>
        )}

        {children}

        {isPhoneLandscape && (
          <>
            <div
              className="absolute inset-0 z-[25]"
              style={{ pointerEvents: zoom > 1 ? "none" : "auto" }}
              onTouchStart={(event) => {
                touchStartRef.current = {
                  x: event.touches[0].clientX,
                  y: event.touches[0].clientY,
                };
              }}
              onTouchEnd={(event) => {
                const touchStart = touchStartRef.current;
                if (!touchStart) return;

                const deltaX = Math.abs(
                  event.changedTouches[0].clientX - touchStart.x,
                );
                const deltaY = Math.abs(
                  event.changedTouches[0].clientY - touchStart.y,
                );
                touchStartRef.current = null;
                if (deltaX < 8 && deltaY < 8) onRevealControls();
              }}
              onClick={onRevealControls}
            />

            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-3 z-[35] flex items-center justify-center transition-all duration-300",
                stageControlsVisible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-2 opacity-0",
              )}
            >
              <div
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-inverse-foreground/20 bg-inverse/60 px-4 py-2.5 shadow-2xl backdrop-blur-md"
                onClick={onRevealControls}
              >
                {phoneControls}
              </div>
            </div>
          </>
        )}
      </div>
    </ClassroomLayoutStage>
  );
}

interface ClassroomWhiteboardContentProps {
  roomName: string;
  followViewport: boolean;
}

export function ClassroomWhiteboardContent({
  roomName,
  followViewport,
}: ClassroomWhiteboardContentProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <SharedWhiteboard
        roomName={roomName}
        isReadonly={true}
        followViewport={followViewport}
      />
    </div>
  );
}

type ScreenTrackReference = NonNullable<
  ComponentProps<typeof VideoTrack>["trackRef"]
>;

interface ClassroomScreenShareContentProps {
  trackRef: ScreenTrackReference;
  zoom: number;
  pan: { x: number; y: number };
  isPhoneLandscape: boolean;
  stageControlsVisible: boolean;
  onRevealControls: () => void;
  onStartPan: (clientX: number, clientY: number) => void;
  onZoom: (delta: number) => void;
  loadingLabel: string;
  presenterDescription?: string;
}

export function ClassroomScreenShareContent({
  trackRef,
  zoom,
  pan,
  isPhoneLandscape,
  stageControlsVisible,
  onRevealControls,
  onStartPan,
  onZoom,
  loadingLabel,
  presenterDescription,
}: ClassroomScreenShareContentProps) {
  return (
    <>
      <div
        key={trackRef.publication.trackSid}
        className={cn(
          "relative flex h-full w-full origin-center select-none items-center justify-center bg-inverse",
          zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
        onMouseDown={
          zoom > 1
            ? (event) => {
                event.preventDefault();
                onRevealControls();
                onStartPan(event.clientX, event.clientY);
              }
            : undefined
        }
        onTouchStart={
          zoom > 1
            ? (event) => {
                const touch = event.touches[0];
                onRevealControls();
                onStartPan(touch.clientX, touch.clientY);
              }
            : undefined
        }
      >
        <VideoTrack
          trackRef={trackRef}
          className="h-full w-full object-contain"
          onError={(event) => console.error("Video Track Error", event)}
        />

        {(!trackRef.publication.isSubscribed ||
          !trackRef.publication.track) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-inverse/90 backdrop-blur-sm">
            <Loader2 className="mb-4 size-12 animate-spin text-info" />
            <p className="text-lg font-bold text-inverse-foreground">
              {loadingLabel}
            </p>
            {presenterDescription && (
              <p className="mt-2 font-mono text-xs text-inverse-foreground/50">
                {presenterDescription}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          "absolute right-4 top-4 z-40 flex gap-2 rounded-lg border border-border/50 bg-background/60 p-1.5 text-foreground backdrop-blur-sm transition-all duration-300",
          isPhoneLandscape && !stageControlsVisible
            ? "pointer-events-none -translate-y-2 opacity-0"
            : "translate-y-0 opacity-100",
        )}
      >
        <button
          type="button"
          onClick={() => onZoom(-0.25)}
          className="rounded p-2 hover:bg-foreground/20"
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="min-w-[3ch] py-2 text-center font-mono text-xs">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onZoom(0.25)}
          className="rounded p-2 hover:bg-foreground/20"
        >
          <ZoomIn className="size-4" />
        </button>
      </div>
    </>
  );
}
