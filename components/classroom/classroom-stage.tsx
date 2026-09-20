"use client";

import { VideoTrack } from "@livekit/components-react";
import { Loader2 } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import { ClassroomLayoutStage } from "./classroom-layout";
import { SharedWhiteboard } from "./shared-whiteboard";
import { ClassroomDisplayControls } from "./classroom-display-controls";
import { useClassroomPresentation } from "./classroom-presentation";

interface ClassroomStageSurfaceProps extends ComponentPropsWithoutRef<"div"> {
  stageRef?: RefObject<HTMLDivElement | null>;
}

export function ClassroomStageSurface({
  stageRef,
  children,
  className,
  ...props
}: ClassroomStageSurfaceProps) {
  return (
    <ClassroomLayoutStage>
      <div
        ref={stageRef}
        className={cn(
          "@container group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ClassroomLayoutStage>
  );
}

interface ClassroomStageProps {
  stageRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
  phoneControls: ReactNode;
  countdown?: ReactNode;
  isPhoneLandscape: boolean;
  stageControlsVisible: boolean;
  onRevealControls: () => void;
  zoom: number;
  onZoom: (delta: number) => void;
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
  countdown,
  isPhoneLandscape,
  stageControlsVisible,
  onRevealControls,
  zoom,
  onZoom,
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
  const compact = useClassroomPresentation()?.mode === "compact";
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <ClassroomStageSurface
      stageRef={stageRef}
      className={cn(
        className,
        isPhoneLandscape &&
          stageControlsVisible &&
          "[--classroom-notification-bottom:4.5rem]",
      )}
    >
      {children}
      {compact && countdown && (
        <div className="pointer-events-none absolute left-2 top-2 z-20">
          {countdown}
        </div>
      )}
      <ClassroomDisplayControls
        zoom={zoom}
        onZoom={contentActive && !isWhiteboardActive ? onZoom : undefined}
        isWhiteboardActive={isWhiteboardActive}
        followViewport={followViewport}
        onToggleFollowViewport={onToggleFollowViewport}
        followingLabel={followingLabel}
        unlockedLabel={unlockedLabel}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        enterFullscreenLabel={enterFullscreenLabel}
        exitFullscreenLabel={exitFullscreenLabel}
      />

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
    </ClassroomStageSurface>
  );
}

interface ClassroomWhiteboardContentProps {
  roomName: string;
  followViewport: boolean;
  recordingToken?: string;
  presentationMode?: boolean;
  onReady?: () => void;
  previewContent?: ReactNode;
}

export function ClassroomWhiteboardContent({
  roomName,
  followViewport,
  recordingToken,
  presentationMode = false,
  onReady,
  previewContent,
}: ClassroomWhiteboardContentProps) {
  const presentation = useClassroomPresentation();
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onPointerDownCapture={(event) => {
        if (!presentation?.external) return;
        // Excalidraw's drag listeners remain bound to the original window.
        event.preventDefault();
        event.stopPropagation();
        presentation.returnToClassroom();
      }}
    >
      {previewContent ?? (
        <SharedWhiteboard
          roomName={roomName}
          isReadonly={true}
          followViewport={followViewport}
          recordingToken={recordingToken}
          presentationMode={presentationMode}
          onReady={onReady}
        />
      )}
    </div>
  );
}

type ScreenTrackReference = NonNullable<
  ComponentProps<typeof VideoTrack>["trackRef"]
>;

interface ClassroomScreenShareCanvasProps {
  trackRef: ScreenTrackReference;
  className?: string;
  onVideoReady?: () => void;
}

export function ClassroomScreenShareCanvas({
  trackRef,
  className,
  onVideoReady,
}: ClassroomScreenShareCanvasProps) {
  return (
    <VideoTrack
      trackRef={trackRef}
      className={cn("h-full w-full object-contain", className)}
      onCanPlay={onVideoReady}
      onLoadedData={onVideoReady}
      onError={(event) => console.error("Video Track Error", event)}
    />
  );
}

interface ClassroomScreenShareContentProps {
  trackRef?: ScreenTrackReference;
  previewContent?: ReactNode;
  zoom: number;
  pan: { x: number; y: number };
  onRevealControls: () => void;
  onStartPan: (clientX: number, clientY: number) => void;
  loadingLabel: string;
  presenterDescription?: string;
  onVideoReady?: () => void;
}

export function ClassroomScreenShareContent({
  trackRef,
  previewContent,
  zoom,
  pan,
  onRevealControls,
  onStartPan,
  loadingLabel,
  presenterDescription,
  onVideoReady,
}: ClassroomScreenShareContentProps) {
  if (!trackRef && !previewContent) return null;

  const isMediaReady = Boolean(
    previewContent ||
      (trackRef?.publication.isSubscribed && trackRef.publication.track),
  );

  return (
    <>
      <div
        key={trackRef?.publication.trackSid ?? "preview-screen-share"}
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
        {previewContent ?? (
          <ClassroomScreenShareCanvas
            trackRef={trackRef!}
            onVideoReady={onVideoReady}
          />
        )}

        {!isMediaReady && (
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
    </>
  );
}
