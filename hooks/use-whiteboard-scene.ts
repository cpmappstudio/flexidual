"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWhiteboardBuckets } from "./use-whiteboard-buckets";
import { useWhiteboardImageRefs } from "./use-whiteboard-image-refs";

/** Subscribe only to occupied, bounded buckets. Image changes never resend drawings. */
export function useWhiteboardScene(
  roomName: string,
  liveRoomName: string,
  isReadonly: boolean,
  recordingToken?: string,
) {
  const manifest = useQuery(api.whiteboardSessions.getSceneManifest, {
    roomName,
    recordingToken,
  });
  const pageId = manifest?.format === 2 ? manifest.notebookPageId : undefined;
  const ensure = useMutation(api.whiteboardSessions.ensureScene);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    // A recovered manifest or a new attempt retires only the preceding attempt's error.
    setError(undefined);
    if (isReadonly || manifest === undefined || manifest?.format === 2) return;
    let active = true;
    void ensure({ roomName, expectedLiveRoomName: liveRoomName }).catch(
      (failure) => {
        if (active) setError(failure);
      },
    );
    return () => {
      active = false;
    };
  }, [ensure, roomName, liveRoomName, isReadonly, manifest]);
  const legacy = useQuery(
    api.whiteboardSessions.getScene,
    manifest?.format === 1 ? { roomName, recordingToken } : "skip",
  );
  const files = useQuery(
    api.whiteboardSessions.getSceneFiles,
    manifest?.format === 2 && !pageId ? { roomName, recordingToken } : "skip",
  );
  const scope = JSON.stringify([
    roomName,
    recordingToken,
    manifest?.format === 2 ? manifest.sourceId : undefined,
    manifest?.generation,
    pageId,
  ]);
  const incremental = useWhiteboardBuckets(
    manifest?.format === 2 ? manifest : undefined,
    api.whiteboardSessions.getSceneBucket,
    {
      roomName,
      ...(recordingToken ? { recordingToken } : {}),
      ...(pageId ? { expectedPageId: pageId } : {}),
    },
    scope,
  );
  const notebookFiles = useWhiteboardImageRefs(
    pageId ? incremental : undefined,
    api.whiteboardSessions.getPresentedFiles,
    {
      roomName,
      ...(recordingToken ? { recordingToken } : {}),
      ...(pageId ? { pageId } : {}),
    },
  );
  const scene = useMemo(() => {
    const elements =
      manifest === undefined
        ? undefined
        : manifest === null
          ? []
          : manifest.format === 1
            ? legacy?.elements
            : incremental;
    if (
      elements === undefined ||
      (manifest?.format === 2 &&
        (pageId ? notebookFiles === undefined : files === undefined))
    )
      return undefined;
    return {
      elements,
      fileRefs: pageId
        ? notebookFiles
        : manifest?.format === 2
          ? files?.fileRefs
          : legacy?.fileRefs,
    };
  }, [incremental, files, notebookFiles, manifest, legacy, pageId]);
  // Writers wait for conversion before mounting; a partial recovery must never save an empty board.
  return {
    scene: !isReadonly && manifest?.format !== 2 ? undefined : scene,
    manifest,
    error,
  };
}
