"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  parseWhiteboardElements,
  sortWhiteboardElements,
  joinWhiteboardPayload,
} from "@/lib/whiteboard-elements";

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
    manifest?.format === 2 ? { roomName, recordingToken } : "skip",
  );
  const queries = useMemo(
    () =>
      Object.fromEntries(
        (manifest?.format === 2 ? manifest.bucketIds : []).map((bucketId) => [
          String(bucketId),
          {
            query: api.whiteboardSessions.getSceneBucket,
            args: {
              roomName,
              ...(recordingToken ? { recordingToken } : {}),
              bucketId,
            },
          },
        ]),
      ),
    [roomName, recordingToken, manifest],
  );
  const buckets = useQueries(queries);
  const parsedBuckets = useRef(
    new Map<
      number,
      { parts: string[]; elements: ReturnType<typeof parseWhiteboardElements> }
    >(),
  );
  const elements = useMemo(() => {
    if (manifest === undefined) return undefined;
    if (manifest === null) return [];
    if (manifest.format === 1) return legacy?.elements;
    const parts = manifest.bucketIds.map((id) => buckets[String(id)]);
    for (const part of parts) if (part instanceof Error) throw part;
    if (
      parts.some(
        (part) =>
          part === undefined || part?.generation !== manifest.generation,
      )
    )
      return undefined;
    return sortWhiteboardElements(
      parts.flatMap((part, index) => {
        if (!part) return [];
        const id = manifest.bucketIds[index];
        let cached = parsedBuckets.current.get(id);
        if (!cached || cached.parts !== part.parts) {
          cached = {
            parts: part.parts,
            elements: parseWhiteboardElements(
              joinWhiteboardPayload(part.parts),
            ),
          };
          parsedBuckets.current.set(id, cached);
        }
        return cached.elements;
      }),
      manifest.legacyOrder,
    );
  }, [manifest, legacy, buckets]);
  const scene = useMemo(() => {
    if (
      elements === undefined ||
      (manifest?.format === 2 && files === undefined)
    )
      return undefined;
    return {
      elements,
      fileRefs: manifest?.format === 2 ? files?.fileRefs : legacy?.fileRefs,
    };
  }, [elements, files, manifest, legacy]);
  // Writers wait for conversion before mounting; a partial recovery must never save an empty board.
  return {
    scene: !isReadonly && manifest?.format !== 2 ? undefined : scene,
    manifest,
    error,
  };
}
