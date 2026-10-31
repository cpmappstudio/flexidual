import { compareValues, ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { curriculumIconValidator } from "./model/curriculumIcons";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";
import {
  requireLiveWhiteboardManager,
  requireLiveWhiteboardReader,
  hasWhiteboardRecordingAccess,
  getWhiteboardRoom,
  canManageWhiteboardRoom,
  canReadWhiteboardRoom,
} from "./model/whiteboardAccess";
import {
  getEventActivationId,
  getLiveActivationId,
  getLiveRoomName,
} from "./model/liveActivation";
import { findEventRoom } from "./model/eventRoomAccess";
import { revokeWhiteboardRecordingToken } from "./model/whiteboardRecording";
import {
  requireCourseNotebookAccess,
  requireNotebookPage,
} from "./model/courseNotebookAccess";
import { createNotebookPage } from "./courseNotebook";
import { resolveWhiteboardPresentation } from "./model/whiteboardPresentation";
import { readNotebookFileRefs } from "./model/notebookFiles";
import {
  deleteWhiteboardBucketBatch,
  ensureWhiteboardManifest,
  findWhiteboardManifest,
  readWhiteboardBucket,
  whiteboardManifestResult,
  readWhiteboardBucketResult,
  applyWhiteboardSceneDelta,
  whiteboardCursorValidator,
  whiteboardBucketResultValidator,
  whiteboardDeltaResultValidator,
} from "./model/whiteboardSceneStorage";
import {
  WHITEBOARD_BUCKET_COUNT,
  joinWhiteboardPayload,
  parseWhiteboardElements,
  sortWhiteboardElements,
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
  notebookPageId: v.optional(v.id("courseNotebookPages")),
  sessionPageId: v.optional(v.id("courseNotebookPages")),
  sessionDraftKey: v.optional(v.string()),
});

function liveManifestResult(
  room: Doc<"whiteboardSceneManifests">,
  presented: Doc<"whiteboardSceneManifests">,
) {
  return {
    ...whiteboardManifestResult(presented),
    // Old clients must keep their room draft key when its scene becomes a course page.
    ...(presented.pageId && presented._id !== room._id
      ? { notebookPageId: presented.pageId }
      : {}),
    ...(room.pageId ? { sessionPageId: room.pageId } : {}),
    ...(presented.sessionDraftKey
      ? { sessionDraftKey: presented.sessionDraftKey }
      : {}),
  };
}

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
      const presented = await resolveWhiteboardPresentation(ctx, manifest);
      return liveManifestResult(manifest, presented);
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

export const getRealtimeWriter = query({
  args: {
    ...sceneReadArgs,
    expectedLiveRoomName: v.string(),
    writerId: v.id("users"),
  },
  returns: v.boolean(),
  handler: async (
    ctx,
    { roomName, expectedLiveRoomName, writerId, recordingToken },
  ) => {
    const manifest = await findWhiteboardManifest(ctx, roomName);
    const legacy = manifest
      ? null
      : await ctx.db
          .query("whiteboardSessions")
          .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
          .unique();
    await requireLiveWhiteboardReader(
      ctx,
      roomName,
      recordingToken,
      manifest ? manifest.recordingToken : legacy?.recordingToken,
    );

    const room = await getWhiteboardRoom(ctx, roomName);
    if (
      !room ||
      room.schedule.status !== "active" ||
      !room.schedule.isLive ||
      getLiveRoomName(room.schedule) !== expectedLiveRoomName
    )
      return false;

    // writerId is the inspected LiveKit sender, never the caller's identity.
    const writer = await ctx.db.get("users", writerId);
    return Boolean(
      writer?.isActive && (await canManageWhiteboardRoom(ctx, writerId, room)),
    );
  },
});

export const getRealtimeAudience = query({
  args: {
    roomName: v.string(),
    expectedLiveRoomName: v.string(),
    participants: v.array(
      v.object({ identity: v.string(), userId: v.id("users") }),
    ),
  },
  returns: v.array(v.string()),
  handler: async (ctx, { roomName, expectedLiveRoomName, participants }) => {
    const room = await requireLiveWhiteboardManager(ctx, roomName);
    const { schedule } = room;
    if (getLiveRoomName(schedule) !== expectedLiveRoomName) return [];
    if (
      participants.length > 256 ||
      participants.some(({ identity }) => !identity || identity.length > 512)
    )
      throw new ConvexError("INVALID_WHITEBOARD_AUDIENCE");

    // User IDs describe candidate recipients, never the caller's identity.
    const allowed = new Map<string, Set<string>>();
    await Promise.all(
      [...new Set(participants.map(({ userId }) => userId))].map(
        async (userId) => {
          const user = await ctx.db.get("users", userId);
          if (
            !user?.isActive ||
            !(await canReadWhiteboardRoom(ctx, userId, room))
          )
            return;
          const identities = new Set([user.clerkId]);
          allowed.set(userId, identities);
          const companion = `${user.clerkId}-companion`;
          if (
            participants.some(
              (participant) =>
                participant.userId === userId &&
                participant.identity === companion,
            ) &&
            (await canManageWhiteboardRoom(ctx, userId, room))
          )
            identities.add(companion);
        },
      ),
    );
    const recipients = new Set(
      participants
        .filter(({ identity, userId }) => allowed.get(userId)?.has(identity))
        .map(({ identity }) => identity),
    );

    const manifest = await findWhiteboardManifest(ctx, roomName);
    const legacy = manifest
      ? null
      : await ctx.db
          .query("whiteboardSessions")
          .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
          .unique();
    const token = manifest ? manifest.recordingToken : legacy?.recordingToken;
    if (token) {
      const recordings = await Promise.all(
        (["starting", "active"] as const).map((status) =>
          room.kind === "class"
            ? ctx.db
                .query("recordings")
                .withIndex("by_schedule", (q) =>
                  q.eq("scheduleId", room.schedule._id).eq("status", status),
                )
                .order("desc")
                .take(32)
            : ctx.db
                .query("recordings")
                .withIndex("by_event_occurrence", (q) =>
                  q
                    .eq("eventOccurrenceId", room.schedule._id)
                    .eq("status", status),
                )
                .order("desc")
                .take(32),
        ),
      );
      for (const recording of recordings.flat())
        if (
          recording.roomName === roomName &&
          recording.activationId ===
            (room.kind === "class"
              ? getLiveActivationId(room.schedule)
              : getEventActivationId(room.schedule)) &&
          recording.recordingToken === token
        )
          // LiveKit BuildEgressToken uses egressID as its hidden participant identity.
          recipients.add(recording.egressId);
    }
    return [...recipients].sort();
  },
});

async function ensureCourseWhiteboardScene(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  const roomName = schedule.roomName;
  const manifest = await ensureWhiteboardManifest(ctx, roomName);
  if (!manifest.pageId) {
    const { course, user } = await requireCourseNotebookAccess(
      ctx,
      schedule.classId,
      true,
    );
    const pageId = await createNotebookPage(ctx, course, user._id);
    if (!manifest.bucketIds.length)
      await ctx.db.patch("courseNotebookPages", pageId, {
        retiredAt: Date.now(),
      });
    const session = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    // Transfer references once; keep the actual scene blocks and image bytes.
    for (const [fileId, file] of Object.entries(session?.fileRefs ?? {}))
      await ctx.db.insert("courseNotebookFiles", {
        pageId,
        fileId,
        storageId: file.storageId,
        mimeType: file.mimeType,
        created: file.created,
      });
    if (session?.fileRefs)
      await ctx.db.patch("whiteboardSessions", session._id, {
        fileRefs: undefined,
      });
    await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
      pageId,
      sessionDraftKey: roomName,
    });
    return { ...manifest, pageId, sessionDraftKey: roomName };
  }
  return manifest;
}

export const ensureScene = mutation({
  args: { roomName: v.string(), expectedLiveRoomName: v.string() },
  returns: manifestValidator,
  handler: async (ctx, { roomName, expectedLiveRoomName }) => {
    const room = await requireLiveWhiteboardManager(ctx, roomName);
    const { schedule } = room;
    if (getLiveRoomName(schedule) !== expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    const manifest =
      room.kind === "class"
        ? await ensureCourseWhiteboardScene(ctx, room.schedule)
        : await ensureWhiteboardManifest(ctx, roomName);
    const presented = await resolveWhiteboardPresentation(ctx, manifest);
    return liveManifestResult(manifest, presented);
  },
});

export const selectNotebookPage = mutation({
  args: {
    roomName: v.string(),
    expectedLiveRoomName: v.string(),
    pageId: v.union(v.id("courseNotebookPages"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { roomName, expectedLiveRoomName, pageId }) => {
    const room = await requireLiveWhiteboardManager(ctx, roomName);
    if (room.kind !== "class") throw new ConvexError("PERMISSION_DENIED");
    const { schedule } = room;
    if (getLiveRoomName(schedule) !== expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    if (pageId) {
      const { page } = await requireNotebookPage(ctx, pageId, true);
      if (page.classId !== schedule.classId)
        throw new ConvexError("PERMISSION_DENIED");
    }
    const manifest = await ensureCourseWhiteboardScene(ctx, schedule);
    if (manifest.presentedPageId !== (pageId ?? undefined))
      await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
        presentedPageId: pageId ?? undefined,
      });
    return null;
  },
});

export const getPresentedFiles = query({
  args: {
    ...sceneReadArgs,
    pageId: v.id("courseNotebookPages"),
    fileIds: v.array(v.string()),
  },
  returns: v.record(v.string(), fileRefValidator),
  handler: async (ctx, { roomName, recordingToken, pageId, fileIds }) => {
    const room = await findWhiteboardManifest(ctx, roomName);
    await requireLiveWhiteboardReader(
      ctx,
      roomName,
      recordingToken,
      room?.recordingToken,
    );
    const presented = room && (await resolveWhiteboardPresentation(ctx, room));
    if (presented?.pageId !== pageId) return {};
    return readNotebookFileRefs(ctx, pageId, fileIds);
  },
});

export const getSceneBucket = query({
  args: {
    ...sceneReadArgs,
    bucketId: v.number(),
    cursor: v.optional(whiteboardCursorValidator),
    expectedPageId: v.optional(v.id("courseNotebookPages")),
  },
  returns: whiteboardBucketResultValidator,
  handler: async (
    ctx,
    { roomName, recordingToken, bucketId, cursor, expectedPageId },
  ) => {
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
    const presented = await resolveWhiteboardPresentation(ctx, manifest);
    if (
      presented.pageId !== expectedPageId &&
      !(expectedPageId === undefined && presented._id === manifest._id)
    )
      return null;
    return readWhiteboardBucketResult(ctx, presented, bucketId, cursor);
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
    return {
      fileRefs: manifest?.pageId
        ? await readNotebookFileRefs(ctx, manifest.pageId)
        : (session?.fileRefs ?? {}),
    };
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
  returns: whiteboardDeltaResultValidator,
  handler: async (
    ctx,
    { roomName, expectedLiveRoomName, generation, bucketId, parts },
  ) => {
    const room = await requireLiveWhiteboardManager(ctx, roomName);
    const { schedule } = room;
    if (getLiveRoomName(schedule) !== expectedLiveRoomName)
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    const manifest =
      room.kind === "class"
        ? await ensureCourseWhiteboardScene(ctx, room.schedule)
        : await ensureWhiteboardManifest(ctx, roomName);
    return applyWhiteboardSceneDelta(
      ctx,
      manifest,
      bucketId,
      parts,
      generation,
    );
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
      fileRefs: manifest?.pageId
        ? await readNotebookFileRefs(ctx, manifest.pageId)
        : session.fileRefs,
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
    v.object({
      leaderParticipantIdentity: v.union(v.string(), v.null()),
      eventId: v.id("events"),
      eventTitle: v.string(),
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
    if (!schedule) {
      const room = await findEventRoom(ctx, roomName);
      if (!room) return null;
      const leader = room.occurrence.sessionLeaderId
        ? await ctx.db.get("users", room.occurrence.sessionLeaderId)
        : null;
      return {
        leaderParticipantIdentity: leader?.clerkId ?? null,
        eventId: room.event._id,
        eventTitle: room.event.title,
      };
    }

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
    const eventRoom = schedule ? null : await findEventRoom(ctx, roomName);
    const target = schedule ?? eventRoom?.occurrence;
    if (
      !target ||
      (expectedActivationId &&
        (schedule
          ? getLiveActivationId(schedule)
          : getEventActivationId(eventRoom!.occurrence)) !==
          expectedActivationId) ||
      (recordingToken && (!target.isLive || target.status !== "active"))
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
