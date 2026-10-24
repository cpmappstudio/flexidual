"use client";
import { useEffect, useMemo, useState } from "react";
import { useQueries } from "convex/react";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { sortWhiteboardElements } from "@/lib/whiteboard-elements";
import {
  applyWhiteboardBucketResult,
  type CachedWhiteboardBucket,
  type WhiteboardBucketCursor,
} from "@/lib/whiteboard-bucket-updates";

/** Shared bounded subscriptions and checkpoint renewal for live scenes and notebook pages. */
export function useWhiteboardBuckets(
  manifest:
    | {
        generation: number;
        sourceId?: string;
        bucketIds: number[];
        legacyOrder?: string[];
      }
    | undefined,
  query: FunctionReference<"query">,
  args: Record<string, string>,
  scope: string,
) {
  const queryName = getFunctionName(query);
  const stableQuery = useMemo(
    () => makeFunctionReference<"query">(queryName),
    [queryName],
  );
  const argsKey = JSON.stringify(args);
  const baseArgs = useMemo<Record<string, string>>(
    () => JSON.parse(argsKey),
    [argsKey],
  );
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
        (manifest ? manifest.bucketIds : []).map((bucketId) => [
          String(bucketId),
          {
            query: stableQuery,
            args: {
              ...baseArgs,
              bucketId,
              ...(anchors.scope === scope && anchors.values[bucketId]
                ? { cursor: anchors.values[bucketId] }
                : {}),
            },
          },
        ]),
      ),
    [baseArgs, stableQuery, manifest, anchors, scope],
  );
  const buckets = useQueries(queries);
  const elements = useMemo(() => {
    if (manifest === undefined) return undefined;
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
  }, [manifest, buckets, parsedBuckets]);
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
  return elements;
}
