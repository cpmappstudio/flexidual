"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { sortWhiteboardElements } from "@/lib/whiteboard-elements";
import {
  applyWhiteboardBucketResult,
  type CachedWhiteboardBucket,
  type WhiteboardBucketCursor,
} from "@/lib/whiteboard-bucket-updates";

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
  const scope = JSON.stringify([
    roomName,
    recordingToken,
    manifest?.format === 2 ? manifest.sourceId : undefined,
    manifest?.generation,
  ]);
  const [anchors, setAnchors] = useState<{
    scope: string;
    values: Record<number, WhiteboardBucketCursor>;
  }>({ scope, values: {} });
  const parsedBuckets = useMemo(
    () => ({ scope, values: new Map<number, CachedWhiteboardBucket>() }),
    [scope],
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
              ...(anchors.scope === scope && anchors.values[bucketId]
                ? { cursor: anchors.values[bucketId] }
                : {}),
            },
          },
        ]),
      ),
    [roomName, recordingToken, manifest, anchors, scope],
  );
  const buckets = useQueries(queries);
  const elements = useMemo(() => {
    if (manifest === undefined) return undefined;
    if (manifest === null) return [];
    if (manifest.format === 1) return legacy?.elements;
    for (const id of manifest.bucketIds)
      if (buckets[String(id)] instanceof Error) throw buckets[String(id)];
    const complete = [];
    for (const id of manifest.bucketIds) {
      const part = buckets[String(id)];
      if (part instanceof Error) throw part;
      let cached = parsedBuckets.values.get(id);
      if (part !== undefined) {
        if (
          !part ||
          part.generation !== manifest.generation ||
          (manifest.sourceId && part.sourceId !== manifest.sourceId)
        )
          return undefined;
        cached = applyWhiteboardBucketResult(cached, part);
        if (cached) parsedBuckets.values.set(id, cached);
        else parsedBuckets.values.delete(id);
      }
      if (!cached) return undefined;
      complete.push(...cached.elements);
    }
    return sortWhiteboardElements(complete, manifest.legacyOrder);
  }, [manifest, legacy, buckets, parsedBuckets]);
  useEffect(() => {
    const values = Object.fromEntries(
      [...parsedBuckets.values].flatMap(([id, cached]) =>
        cached.anchor ? [[id, cached.anchor]] : [],
      ),
    );
    // Batch cursor renewals at applied checkpoints, not on every drawing update.
    setAnchors((previous) =>
      previous.scope === scope &&
      JSON.stringify(previous.values) === JSON.stringify(values)
        ? previous
        : { scope, values },
    );
  }, [elements, scope, parsedBuckets, buckets]);
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
