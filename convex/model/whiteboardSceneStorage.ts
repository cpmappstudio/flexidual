import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { appendWhiteboardBucketHistory } from "../../lib/whiteboard-bucket-updates";
import {
  MAX_WHITEBOARD_PARTS,
  parseWhiteboardElements,
  splitWhiteboardPayload,
  whiteboardBucketId,
  whiteboardJsonBytes,
  type WhiteboardElement,
} from "../../lib/whiteboard-elements";

export function findWhiteboardManifest(
  ctx: QueryCtx | MutationCtx,
  roomName: string,
) {
  return ctx.db
    .query("whiteboardSceneManifests")
    .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
    .unique();
}

export function encodeWhiteboardBucket(elements: readonly WhiteboardElement[]) {
  try {
    return splitWhiteboardPayload(JSON.stringify(elements));
  } catch {
    throw new ConvexError("WHITEBOARD_BUCKET_TOO_LARGE");
  }
}

export async function readWhiteboardBucket(
  ctx: QueryCtx | MutationCtx,
  manifestId: Id<"whiteboardSceneManifests">,
  bucketId: number,
  legacyRemainingBytes?: number,
) {
  const query = ctx.db
    .query("whiteboardSceneBuckets")
    .withIndex("by_manifestId_and_bucketId_and_partIndex", (q) =>
      q.eq("manifestId", manifestId).eq("bucketId", bucketId),
    );
  const parts: Doc<"whiteboardSceneBuckets">[] = [];
  let bytes = 0;
  for await (const part of query) {
    if (parts.length >= MAX_WHITEBOARD_PARTS || part.partIndex !== parts.length)
      throw new ConvexError("INVALID_WHITEBOARD_PARTS");
    bytes += whiteboardJsonBytes(part.jsonPart);
    if (legacyRemainingBytes !== undefined && bytes > legacyRemainingBytes)
      throw new ConvexError("WHITEBOARD_SCENE_REQUIRES_INCREMENTAL_CLIENT");
    parts.push(part);
  }
  return parts;
}

export async function writeWhiteboardBucket(
  ctx: MutationCtx,
  manifestId: Id<"whiteboardSceneManifests">,
  bucketId: number,
  parts: readonly string[],
  existing: readonly Doc<"whiteboardSceneBuckets">[],
  updatedAt = Date.now(),
) {
  const revision = (existing[0]?.revision ?? 0) + 1;
  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const jsonPart = parts[partIndex];
    const metadata = partIndex === 0 ? { revision, updatedAt } : {};
    const previous = existing[partIndex];
    if (!previous)
      await ctx.db.insert("whiteboardSceneBuckets", {
        manifestId,
        bucketId,
        partIndex,
        jsonPart,
        ...metadata,
      });
    else if (partIndex === 0 || previous.jsonPart !== jsonPart)
      await ctx.db.patch("whiteboardSceneBuckets", previous._id, {
        jsonPart,
        ...metadata,
      });
  }
  for (const previous of existing.slice(parts.length))
    await ctx.db.delete("whiteboardSceneBuckets", previous._id);
}

export function findWhiteboardBucketHistory(
  ctx: QueryCtx | MutationCtx,
  manifestId: Id<"whiteboardSceneManifests">,
  bucketId: number,
) {
  return ctx.db
    .query("whiteboardSceneUpdates")
    .withIndex("by_manifestId_and_bucketId", (q) =>
      q.eq("manifestId", manifestId).eq("bucketId", bucketId),
    )
    .unique();
}

export async function recordWhiteboardBucketChanges(
  ctx: MutationCtx,
  manifest: Doc<"whiteboardSceneManifests">,
  bucketId: number,
  previousRevision: number,
  changes: readonly WhiteboardElement[],
) {
  const previous = await findWhiteboardBucketHistory(
    ctx,
    manifest._id,
    bucketId,
  );
  const history = appendWhiteboardBucketHistory(
    previous,
    manifest.generation,
    previousRevision,
    changes,
  );
  if (previous)
    await ctx.db.patch("whiteboardSceneUpdates", previous._id, history);
  else
    await ctx.db.insert("whiteboardSceneUpdates", {
      manifestId: manifest._id,
      bucketId,
      ...history,
    });
}

export async function ensureWhiteboardManifest(
  ctx: MutationCtx,
  roomName: string,
) {
  const existing = await findWhiteboardManifest(ctx, roomName);
  if (existing) return existing;
  const legacy = await ctx.db
    .query("whiteboardSessions")
    .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
    .unique();
  let elements: WhiteboardElement[];
  try {
    elements = parseWhiteboardElements(JSON.stringify(legacy?.elements ?? []), {
      legacy: true,
    });
  } catch {
    throw new ConvexError("INVALID_WHITEBOARD_ELEMENTS");
  }
  const buckets = new Map<number, WhiteboardElement[]>();
  for (const element of elements) {
    const id = whiteboardBucketId(element.id);
    const bucket = buckets.get(id) ?? [];
    bucket.push(element);
    buckets.set(id, bucket);
  }
  // Validate all buckets before writing; failed conversion leaves legacy intact.
  const encoded = [...buckets].map(
    ([id, values]) => [id, encodeWhiteboardBucket(values)] as const,
  );
  if (!legacy)
    await ctx.db.insert("whiteboardSessions", {
      roomName,
      elements: [],
      updatedAt: Date.now(),
    });
  const manifestId = await ctx.db.insert("whiteboardSceneManifests", {
    roomName,
    fromLegacy: Boolean(legacy),
    generation: 0,
    bucketIds: [...buckets.keys()].sort((a, b) => a - b),
    legacyOrder: elements.map((element) => element.id),
    recordingToken: legacy?.recordingToken,
  });
  for (const [bucketId, parts] of encoded)
    await writeWhiteboardBucket(
      ctx,
      manifestId,
      bucketId,
      parts,
      [],
      legacy?.updatedAt ?? Date.now(),
    );
  return (await ctx.db.get("whiteboardSceneManifests", manifestId))!;
}

export function whiteboardManifestResult(
  manifest: Doc<"whiteboardSceneManifests">,
) {
  return {
    format: 2 as const,
    fromLegacy: manifest.fromLegacy,
    generation: manifest.generation,
    bucketIds: manifest.bucketIds,
    legacyOrder: manifest.legacyOrder,
    sourceId: manifest._id,
  };
}

/** Bounded cleanup by immutable manifest ID cannot touch a replacement scene. */
export async function deleteWhiteboardBucketBatch(
  ctx: MutationCtx,
  manifestId: Id<"whiteboardSceneManifests">,
) {
  const buckets = await ctx.db
    .query("whiteboardSceneBuckets")
    .withIndex("by_manifestId_and_bucketId_and_partIndex", (q) =>
      q.eq("manifestId", manifestId),
    )
    .take(8);
  for (const bucket of buckets)
    await ctx.db.delete("whiteboardSceneBuckets", bucket._id);
  const updates = await ctx.db
    .query("whiteboardSceneUpdates")
    .withIndex("by_manifestId_and_bucketId", (q) =>
      q.eq("manifestId", manifestId),
    )
    .take(8);
  for (const update of updates)
    await ctx.db.delete("whiteboardSceneUpdates", update._id);
  if (buckets.length === 8 || updates.length === 8)
    await ctx.scheduler.runAfter(
      0,
      internal.whiteboardSessions.cleanupSceneBuckets,
      { manifestId },
    );
}

export async function deleteWhiteboardManifest(
  ctx: MutationCtx,
  roomName: string,
) {
  const manifest = await findWhiteboardManifest(ctx, roomName);
  if (!manifest) return;
  await ctx.db.delete("whiteboardSceneManifests", manifest._id);
  // Schedule rather than loading image-sized buckets in an existing bulk
  // schedule-deletion transaction. Every continuation remains independently bounded.
  await ctx.scheduler.runAfter(
    0,
    internal.whiteboardSessions.cleanupSceneBuckets,
    {
      manifestId: manifest._id,
    },
  );
}
