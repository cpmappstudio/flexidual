"use client";

import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";
import { useClassroomPresentation } from "./classroom-presentation";

export function ClassroomVideoPipSource({ track }: { track?: Track }) {
  const presentation = useClassroomPresentation();
  return presentation && presentation.floatingKind !== "internal" ? (
    <VideoPipSource
      track={track}
      register={presentation.setVideoElement}
      documentPip={presentation.floatingKind === "document"}
    />
  ) : null;
}

function VideoPipSource({
  track,
  register,
  documentPip,
}: {
  track?: Track;
  register: (video: HTMLVideoElement | null) => void;
  documentPip: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const attachedTrackRef = useRef<Track | undefined>(undefined);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Attach the replacement before detaching the old track to retain the stream.
    track?.attach(video);
    attachedTrackRef.current?.detach(video);
    attachedTrackRef.current = track;
  }, [track]);

  useEffect(() => {
    const video = videoRef.current;
    register(video);
    return () => {
      register(null);
      if (video) attachedTrackRef.current?.detach(video);
      attachedTrackRef.current = undefined;
    };
  }, [register]);

  // Safari renders off-screen native PiP sources black.
  return (
    <video
      ref={videoRef}
      muted
      controls
      playsInline
      aria-hidden="true"
      tabIndex={-1}
      className={
        documentPip
          ? "pointer-events-none fixed -left-[10000px] top-0 h-px w-px"
          : "pointer-events-none fixed left-0 top-0 h-auto w-80 opacity-0"
      }
    />
  );
}
