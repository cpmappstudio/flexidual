import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { whiteboardPreviewBucketRevision } from "../../lib/whiteboard-preview-revision";
import {
  readWhiteboardBucketHistory,
  appendWhiteboardBucketHistory,
} from "../../lib/whiteboard-bucket-updates";
import {
  MAX_WHITEBOARD_PARTS,
  WHITEBOARD_BUCKET_COUNT,
  joinWhiteboardPayload,
  mergeWhiteboardElements,
  parseWhiteboardElements,
  splitWhiteboardPayload,
  whiteboardBucketId,
  whiteboardJsonBytes,
  type WhiteboardElement,
} from "../../lib/whiteboard-elements";

export const whiteboardCursorValidator = v.object({
  sourceId: v.string(),
  generation: v.number(),
  revision: v.number(),
});
export const whiteboardBucketResultValidator = v.union(
  v.null(),
  v.object({
    generation: v.number(),
    parts: v.array(v.string()),
    sourceId: v.optional(v.string()),
    revision: v.optional(v.number()),
    baseRevision: v.optional(v.union(v.null(), v.number())),
    checkpoint: v.optional(v.boolean()),
  }),
);
export const whiteboardDeltaResultValidator = v.object({
  changed: v.boolean(),
  generation: v.number(),
  conflictsParts: v.array(v.string()),
});

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
  merged: readonly WhiteboardElement[],
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
  if (manifest.pageId) {
    const hasContent = merged.some((element) => !element.isDeleted);
    await writeWhiteboardPreviewSignature(
      ctx,
      manifest,
      bucketId,
      await whiteboardPreviewBucketRevision(merged),
      hasContent,
    );
    if (hasContent) {
      const page = await ctx.db.get("courseNotebookPages", manifest.pageId);
      if (page?.retiredAt !== undefined)
        await ctx.db.patch("courseNotebookPages", page._id, {
          retiredAt: undefined,
        });
    }
  }
}

/** Same transaction as the canonical merge; never invalidates scene subscriptions. */
export async function writeWhiteboardPreviewSignature(
  ctx: MutationCtx,
  manifest: Doc<"whiteboardSceneManifests">,
  bucketId: number,
  signature: string,
  hasContent: boolean,
) {
  const existing = await ctx.db
    .query("whiteboardScenePreviewSignatures")
    .withIndex("by_manifestId_and_bucketId", (q) =>
      q.eq("manifestId", manifest._id).eq("bucketId", bucketId),
    )
    .unique();
  const fields = { generation: manifest.generation, signature, hasContent };
  if (existing)
    await ctx.db.patch(
      "whiteboardScenePreviewSignatures",
      existing._id,
      fields,
    );
  else
    await ctx.db.insert("whiteboardScenePreviewSignatures", {
      manifestId: manifest._id,
      bucketId,
      ...fields,
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
  let remaining = buckets.length === 8;
  for (const table of [
    "whiteboardSceneUpdates",
    "whiteboardScenePreviewSignatures",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_manifestId_and_bucketId", (q) =>
        q.eq("manifestId", manifestId),
      )
      .take(8);
    for (const row of rows) await ctx.db.delete(table, row._id);
    remaining ||= rows.length === 8;
  }
  if (remaining)
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
  // A class ending retires only its routing/recording scope, never course notes.
  if (manifest.pageId) {
    await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
      roomName: undefined,
      presentedPageId: undefined,
      recordingToken: undefined,
    });
    return;
  }
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

export async function readWhiteboardBucketResult(
  ctx: QueryCtx | MutationCtx,
  manifest: Doc<"whiteboardSceneManifests">,
  bucketId: number,
  cursor?: { sourceId: string; generation: number; revision: number },
) {
  if (
    !Number.isInteger(bucketId) ||
    bucketId < 0 ||
    bucketId >= WHITEBOARD_BUCKET_COUNT
  )
    throw new ConvexError("INVALID_WHITEBOARD_BUCKET");
  if (
    cursor?.sourceId === manifest._id &&
    cursor.generation === manifest.generation
  ) {
    const history = await findWhiteboardBucketHistory(
      ctx,
      manifest._id,
      bucketId,
    );
    const changes = readWhiteboardBucketHistory(history, cursor);
    if (changes !== null)
      return {
        generation: manifest.generation,
        sourceId: manifest._id,
        revision: history!.revision,
        baseRevision: cursor.revision,
        ...changes,
      };
  }
  const bucket = await readWhiteboardBucket(ctx, manifest._id, bucketId);
  const revision = bucket[0]?.revision ?? 0;
  const unchanged =
    cursor?.sourceId === manifest._id &&
    cursor.generation === manifest.generation &&
    cursor.revision === revision;
  return bucket.length
    ? {
        generation: manifest.generation,
        sourceId: manifest._id,
        revision,
        baseRevision: unchanged ? revision : null,
        parts: unchanged ? [] : bucket.map((part) => part.jsonPart),
        checkpoint: false,
      }
    : null;
}

export async function applyWhiteboardSceneDelta(
  ctx: MutationCtx,
  manifest: Doc<"whiteboardSceneManifests">,
  bucketId: number,
  parts: string[],
  generation: number,
) {
  if (
    !Number.isInteger(bucketId) ||
    bucketId < 0 ||
    bucketId >= WHITEBOARD_BUCKET_COUNT
  )
    throw new ConvexError("INVALID_WHITEBOARD_BUCKET");
  let incoming;
  try {
    incoming = parseWhiteboardElements(joinWhiteboardPayload(parts));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "WHITEBOARD_BUCKET_TOO_LARGE"
    )
      throw new ConvexError("WHITEBOARD_BUCKET_TOO_LARGE");
    throw new ConvexError("INVALID_WHITEBOARD_ELEMENTS");
  }
  if (incoming.some((element) => whiteboardBucketId(element.id) !== bucketId))
    throw new ConvexError("INVALID_WHITEBOARD_BUCKET");
  if (manifest.generation !== generation)
    throw new ConvexError("STALE_WHITEBOARD_GENERATION");
  const existing = await readWhiteboardBucket(ctx, manifest._id, bucketId);
  const elements = mergeWhiteboardElements(
    existing.length
      ? parseWhiteboardElements(
          joinWhiteboardPayload(existing.map((part) => part.jsonPart)),
        )
      : [],
    incoming,
    manifest.legacyOrder,
  );
  const mergedParts = encodeWhiteboardBucket(elements);
  const winners = new Map(elements.map((element) => [element.id, element]));
  // A successful merge is not proof that every submitted revision won. Echo
  // only rejected revisions so the caller can retain newer local edits while
  // acknowledging the server's actual result, without rereading the bucket.
  const conflicts = incoming.flatMap((element) => {
    const winner = winners.get(element.id)!;
    return winner.version !== element.version ||
      winner.versionNonce !== element.versionNonce ||
      (winner.index ?? null) !== (element.index ?? null)
      ? [winner]
      : [];
  });
  const changed = existing.length
    ? existing.length !== mergedParts.length ||
      existing.some((part, i) => part.jsonPart !== mergedParts[i])
    : elements.length > 0;
  if (changed) {
    await writeWhiteboardBucket(
      ctx,
      manifest._id,
      bucketId,
      mergedParts,
      existing,
    );
    await recordWhiteboardBucketChanges(
      ctx,
      manifest,
      bucketId,
      existing[0]?.revision ?? 0,
      incoming.map((element) => winners.get(element.id)!),
      elements,
    );
    if (!manifest.bucketIds.includes(bucketId))
      await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
        bucketIds: [...manifest.bucketIds, bucketId].sort((a, b) => a - b),
      });
  }
  return {
    changed,
    generation: manifest.generation,
    conflictsParts: conflicts.length ? encodeWhiteboardBucket(conflicts) : [],
  };
}
