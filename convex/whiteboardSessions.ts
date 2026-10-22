import { compareValues, ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { curriculumIconValidator } from "./model/curriculumIcons";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";
import {
  requireLiveWhiteboardManager,
  requireLiveWhiteboardReader,
  hasWhiteboardRecordingAccess,
} from "./model/whiteboardAccess";
import { getLiveActivationId, getLiveRoomName } from "./model/liveActivation";
import { revokeWhiteboardRecordingToken } from "./model/whiteboardRecording";
import {
  deleteWhiteboardBucketBatch,
  encodeWhiteboardBucket,
  ensureWhiteboardManifest,
  findWhiteboardManifest,
  readWhiteboardBucket,
  writeWhiteboardBucket,
  whiteboardManifestResult,
  findWhiteboardBucketHistory,
  recordWhiteboardBucketChanges,
} from "./model/whiteboardSceneStorage";
import { readWhiteboardBucketHistory } from "../lib/whiteboard-bucket-updates";
import {
  WHITEBOARD_BUCKET_COUNT,
  joinWhiteboardPayload,
  mergeWhiteboardElements,
  parseWhiteboardElements,
  sortWhiteboardElements,
  whiteboardBucketId,
  whiteboardJsonBytes,
} from "../lib/whiteboard-elements";

export const fileRefValidator = v.object({
  url: v.string(),
  mimeType: v.string(),
  storageId: v.id("_storage"),
  created: v.number(),
});

function fitsLegacyValue(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (Array.isArray(value))
    return (
      value.length <= 8192 &&
      value.every((item) => fitsLegacyValue(item, depth + 1))
    );
  if (value && typeof value === "object") {
    const values = Object.values(value);
    return (
      values.length <= 1024 &&
      values.every((item) => fitsLegacyValue(item, depth + 1))
    );
  }
  return true;
}

const sceneReadArgs = {
  roomName: v.string(),
  recordingToken: v.optional(v.string()),
};
const manifestValidator = v.object({
  format: v.union(v.literal(1), v.literal(2)),
  fromLegacy: v.boolean(),
  generation: v.number(),
  bucketIds: v.array(v.number()),
  legacyOrder: v.array(v.string()),
  sourceId: v.optional(v.string()),
});

export const getSceneManifest = query({
  args: sceneReadArgs,
  returns: v.union(v.null(), manifestValidator),
  handler: async (ctx, { roomName, recordingToken }) => {
    const manifest = await findWhiteboardManifest(ctx, roomName);
    if (manifest) {
      await requireLiveWhiteboardReader(
        ctx,
        roomName,
        recordingToken,
        manifest.recordingToken,
      );
      return whiteboardManifestResult(manifest);
    }
    const legacy = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    await requireLiveWhiteboardReader(
      ctx,
      roomName,
      recordingToken,
      legacy?.recordingToken,
    );
    return legacy
      ? {
          format: 1 as const,
          fromLegacy: true,
          generation: 0,
          bucketIds: [],
          legacyOrder: [],
        }
      : null;
  },
});

export const ensureScene = mutation({
  args: { roomName: v.string(), expectedLiveRoomName: v.string() },
  returns: manifestValidator,
  handler: async (ctx, { roomName, expectedLiveRoomName }) => {
    const { schedule } = await requireLiveWhiteboardManager(ctx, roomName);
    if (getLiveRoomName(schedule) !== expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    return whiteboardManifestResult(
      await ensureWhiteboardManifest(ctx, roomName),
    );
  },
});

export const getSceneBucket = query({
  args: {
    ...sceneReadArgs,
    bucketId: v.number(),
    cursor: v.optional(
      v.object({
        sourceId: v.string(),
        generation: v.number(),
        revision: v.number(),
      }),
    ),
  },
  returns: v.union(
    v.null(),
    v.object({
      generation: v.number(),
      parts: v.array(v.string()),
      sourceId: v.optional(v.string()),
      revision: v.optional(v.number()),
      baseRevision: v.optional(v.union(v.null(), v.number())),
      checkpoint: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, { roomName, recordingToken, bucketId, cursor }) => {
    if (
      !Number.isInteger(bucketId) ||
      bucketId < 0 ||
      bucketId >= WHITEBOARD_BUCKET_COUNT
    )
      throw new ConvexError("INVALID_WHITEBOARD_BUCKET");
    const manifest = await findWhiteboardManifest(ctx, roomName);
    await requireLiveWhiteboardReader(
      ctx,
      roomName,
      recordingToken,
      manifest?.recordingToken,
    );
    if (!manifest) return null;
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
  },
});

export const getSceneFiles = query({
  args: sceneReadArgs,
  returns: v.object({ fileRefs: v.record(v.string(), fileRefValidator) }),
  handler: async (ctx, { roomName, recordingToken }) => {
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const manifest = await findWhiteboardManifest(ctx, roomName);
    await requireLiveWhiteboardReader(
      ctx,
      roomName,
      recordingToken,
      manifest ? manifest.recordingToken : session?.recordingToken,
    );
    return { fileRefs: session?.fileRefs ?? {} };
  },
});

export const applySceneDelta = mutation({
  args: {
    roomName: v.string(),
    expectedLiveRoomName: v.string(),
    generation: v.number(),
    bucketId: v.number(),
    parts: v.array(v.string()),
  },
  returns: v.object({
    changed: v.boolean(),
    generation: v.number(),
    conflictsParts: v.array(v.string()),
  }),
  handler: async (
    ctx,
    { roomName, expectedLiveRoomName, generation, bucketId, parts },
  ) => {
    const { schedule } = await requireLiveWhiteboardManager(ctx, roomName);
    if (getLiveRoomName(schedule) !== expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
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
    const manifest = await ensureWhiteboardManifest(ctx, roomName);
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
  },
});

export const cleanupSceneBuckets = internalMutation({
  args: { manifestId: v.id("whiteboardSceneManifests") },
  returns: v.null(),
  handler: async (ctx, { manifestId }) => {
    // Only detached manifests are eligible; a stray cleanup cannot erase live data.
    if (!(await ctx.db.get("whiteboardSceneManifests", manifestId)))
      await deleteWhiteboardBucketBatch(ctx, manifestId);
    return null;
  },
});

/**
 * Upsert the full element list for a room's whiteboard session.
 * Called by the companion device (writer) on every debounced canvas change.
 */
export const upsertScene = mutation({
  args: {
    roomName: v.string(),
    expectedLiveRoomName: v.optional(v.string()),
    elements: v.array(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { roomName, elements, expectedLiveRoomName }) => {
    const { schedule } = await requireLiveWhiteboardManager(ctx, roomName);
    if (
      expectedLiveRoomName !== undefined &&
      getLiveRoomName(schedule) !== expectedLiveRoomName
    )
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    if (await findWhiteboardManifest(ctx, roomName))
      throw new ConvexError("WHITEBOARD_SCENE_UPGRADE_REQUIRED");
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const now = Date.now();
    if (existing) {
      if (compareValues(existing.elements, elements) === 0) return null;
      await ctx.db.patch("whiteboardSessions", existing._id, {
        elements,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("whiteboardSessions", {
        roomName,
        elements,
        updatedAt: now,
      });
    }
    return null;
  },
});

/**
 * Add or update a single image file ref after a successful Convex storage upload.
 * Readers will pick up the new ref via their reactive getScene subscription.
 */
export const addFileRef = mutation({
  args: {
    roomName: v.string(),
    expectedLiveRoomName: v.optional(v.string()),
    fileId: v.string(),
    storageId: v.id("_storage"),
    created: v.number(),
  },
  returns: fileRefValidator,
  handler: async (ctx, { roomName }) => {
    await requireLiveWhiteboardManager(ctx, roomName);
    // A raw storage ID proves neither who uploaded it nor which room owns it.
    // Keep the endpoint explicit for old clients; only the authenticated body
    // upload's internal completion may associate newly stored image bytes.
    throw new ConvexError("WHITEBOARD_UPLOAD_REQUIRES_AUTHENTICATED_BODY");
  },
});

/**
 * Reactive query — returns the current scene for a room.
 * All participants (teacher view, students) subscribe to this; they re-render
 * automatically whenever the companion device writes a new snapshot.
 */
export const getScene = query({
  args: {
    roomName: v.string(),
    recordingToken: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("whiteboardSessions"),
      _creationTime: v.number(),
      roomName: v.string(),
      elements: v.array(v.any()),
      fileRefs: v.optional(v.record(v.string(), fileRefValidator)),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, { roomName, recordingToken }) => {
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (!session) return null;

    await requireLiveWhiteboardReader(
      ctx,
      roomName,
      recordingToken,
      session.recordingToken,
    );
    const manifest = await findWhiteboardManifest(ctx, roomName);
    let elements = session.elements;
    let updatedAt = session.updatedAt;
    if (manifest) {
      const merged = [];
      let bytes = 0;
      let revision = 0;
      for (const bucketId of manifest.bucketIds) {
        const bucket = await readWhiteboardBucket(
          ctx,
          manifest._id,
          bucketId,
          8 * 1024 * 1024 - bytes,
        );
        if (!bucket.length) continue;
        updatedAt = Math.max(updatedAt, bucket[0].updatedAt ?? 0);
        revision += bucket[0].revision ?? 0;
        const json = joinWhiteboardPayload(bucket.map((part) => part.jsonPart));
        bytes += whiteboardJsonBytes(json);
        if (bytes > 8 * 1024 * 1024)
          throw new ConvexError("WHITEBOARD_SCENE_REQUIRES_INCREMENTAL_CLIENT");
        merged.push(...parseWhiteboardElements(json));
      }
      elements = sortWhiteboardElements(merged, manifest.legacyOrder).filter(
        (element) => !element.isDeleted,
      );
      if (!fitsLegacyValue(elements))
        throw new ConvexError("WHITEBOARD_SCENE_REQUIRES_INCREMENTAL_CLIENT");
      // Legacy viewers use this field as their scene dependency. The summed
      // monotonic revisions also distinguish edits made in one clock tick.
      updatedAt += revision;
    }

    return {
      _id: session._id,
      _creationTime: session._creationTime,
      roomName: session.roomName,
      elements,
      fileRefs: session.fileRefs,
      updatedAt,
    };
  },
});

export const getRecordingContext = query({
  args: {
    roomName: v.string(),
    recordingToken: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      leaderParticipantIdentity: v.union(v.string(), v.null()),
      courseId: v.id("classes"),
      className: v.string(),
      curriculumIconKey: curriculumIconValidator,
    }),
  ),
  handler: async (ctx, { roomName, recordingToken }) => {
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (!session) return null;
    if (!hasWhiteboardRecordingAccess(recordingToken, session.recordingToken)) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", roomName))
      .first();
    if (!schedule) return null;

    const classData = await ctx.db.get("classes", schedule.classId);
    if (!classData) return null;

    const curriculum = await ctx.db.get("curriculums", classData.curriculumId);
    const leader = schedule.sessionLeaderId
      ? await ctx.db.get("users", schedule.sessionLeaderId)
      : null;
    return {
      leaderParticipantIdentity: leader?.clerkId ?? null,
      courseId: classData._id,
      className: classData.name,
      curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
    };
  },
});

export const setRecordingToken = internalMutation({
  args: {
    roomName: v.string(),
    recordingToken: v.optional(v.string()),
    expectedActivationId: v.optional(v.string()),
    expectedToken: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (
    ctx,
    { roomName, recordingToken, expectedActivationId, expectedToken },
  ) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", roomName))
      .unique();
    if (
      !schedule ||
      (expectedActivationId &&
        getLiveActivationId(schedule) !== expectedActivationId) ||
      (recordingToken && (!schedule.isLive || schedule.status !== "active"))
    )
      return false;
    if (recordingToken && expectedActivationId) {
      const activation = await ctx.db
        .query("liveRoomActivations")
        .withIndex("by_activation_id", (q) =>
          q.eq("activationId", expectedActivationId),
        )
        .unique();
      if (
        activation?.recordingToken !== recordingToken ||
        activation.status !== "active"
      )
        return false;
    }
    if (!recordingToken && expectedToken)
      return revokeWhiteboardRecordingToken(ctx, roomName, expectedToken);
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (expectedToken && existing?.recordingToken !== expectedToken)
      return false;
    const manifest = await findWhiteboardManifest(ctx, roomName);
    if (manifest && manifest.recordingToken !== recordingToken)
      await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
        recordingToken,
      });
    if (existing && existing.recordingToken !== recordingToken) {
      await ctx.db.patch(existing._id, { recordingToken });
    } else if (!existing && recordingToken) {
      await ctx.db.insert("whiteboardSessions", {
        roomName,
        elements: [],
        recordingToken,
        updatedAt: Date.now(),
      });
    }
    return true;
  },
});
