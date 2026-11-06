"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { startVideoProgress } from "@/lib/video-progress-session";
import { validVideoDuration } from "@/lib/video-progress";

export function useVideoViewingProgress(
  id: Id<"classSessionVideos">,
  video: HTMLVideoElement | null,
  enabled: boolean,
  viewerScope: string,
  viewerId: string,
  resumeFromProgress = true,
) {
  const client = useConvex();
  const clerk = useClerk();
  const [pending, setPending] = useState(false);
  const [readyVideo, setReadyVideo] = useState<HTMLVideoElement | null>(null);
  const identity = useRef(viewerScope);
  const storageKey = JSON.stringify([client.url, viewerId, id]);
  useLayoutEffect(() => {
    identity.current = viewerScope;
  }, [viewerScope]);
  useEffect(() => {
    if (
      !enabled ||
      !viewerId ||
      !video ||
      !validVideoDuration(video.duration * 1000)
    )
      return;
    return startVideoProgress(video, {
      prepare: () =>
        client.action(api.classSessionVideoStorage.prepareProgress, { id }),
      save: (progressId, coverage) =>
        client.mutation(api.videoViewingProgress.record, {
          id: progressId as Id<"videoViewingProgress">,
          coverage,
        }),
      onPending: setPending,
      onReady: () => setReadyVideo(video),
      isCurrent: () =>
        identity.current === viewerScope &&
        `${clerk.user?.id}:${clerk.session?.id}` === viewerScope,
      storageKey,
      resumeFromProgress,
    });
  }, [
    client,
    clerk,
    enabled,
    id,
    video,
    viewerScope,
    viewerId,
    storageKey,
    resumeFromProgress,
  ]);
  return {
    pending,
    ready:
      !enabled ||
      !resumeFromProgress ||
      readyVideo === video ||
      (video !== null && !validVideoDuration(video.duration * 1000)),
  };
}
