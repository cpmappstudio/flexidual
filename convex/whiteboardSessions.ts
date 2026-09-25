import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";
import { canAccessSchedule } from "./model/scheduleAccess";
import { curriculumIconValidator } from "./model/curriculumIcons";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";
import { requireLiveWhiteboardManager } from "./model/whiteboardAccess";
import { getLiveActivationId, getLiveRoomName } from "./model/liveActivation";

const fileRefValidator = v.object({
  url: v.string(),
  mimeType: v.string(),
  storageId: v.id("_storage"),
  created: v.number(),
});

const MAX_WHITEBOARD_FILE_SIZE = 10 * 1024 * 1024;

function hasRecordingAccess(
  recordingToken: string | undefined,
  storedToken: string | undefined,
) {
  return Boolean(
    recordingToken && storedToken && recordingToken === storedToken,
  );
}

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
      return null;
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { elements, updatedAt: now });
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
  handler: async (
    ctx,
    { roomName, fileId, storageId, created, expectedLiveRoomName },
  ) => {
    const { schedule } = await requireLiveWhiteboardManager(ctx, roomName);
    if (
      expectedLiveRoomName !== undefined &&
      getLiveRoomName(schedule) !== expectedLiveRoomName
    )
      throw new ConvexError("STALE_LIVE_ACTIVATION");
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
    if (
      !metadata.contentType?.startsWith("image/") ||
      metadata.size > MAX_WHITEBOARD_FILE_SIZE
    ) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("INVALID_WHITEBOARD_FILE");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
    }
    const fileRef = {
      url,
      mimeType: metadata.contentType,
      storageId,
      created,
    };
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    const replacedStorageId = existing?.fileRefs?.[fileId]?.storageId;
    const fileRefs = { ...(existing?.fileRefs ?? {}), [fileId]: fileRef };
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { fileRefs, updatedAt: now });
    } else {
      await ctx.db.insert("whiteboardSessions", {
        roomName,
        elements: [],
        fileRefs,
        updatedAt: now,
      });
    }
    if (replacedStorageId && replacedStorageId !== storageId) {
      await ctx.storage.delete(replacedStorageId).catch(() => undefined);
    }
    return fileRef;
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

    const user = await getCurrentUserFromAuth(ctx);
    if (user) {
      const schedule = await ctx.db
        .query("classSchedule")
        .withIndex("by_room", (q) => q.eq("roomName", roomName))
        .first();
      if (
        !schedule ||
        schedule.status !== "active" ||
        !schedule.isLive ||
        !(await canAccessSchedule(ctx, user._id, schedule))
      ) {
        throw new ConvexError("PERMISSION_DENIED");
      }
    } else if (!hasRecordingAccess(recordingToken, session.recordingToken)) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    return {
      _id: session._id,
      _creationTime: session._creationTime,
      roomName: session.roomName,
      elements: session.elements,
      fileRefs: session.fileRefs,
      updatedAt: session.updatedAt,
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
    if (!hasRecordingAccess(recordingToken, session.recordingToken)) {
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
    const existing = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    if (expectedToken && existing?.recordingToken !== expectedToken)
      return false;
    if (existing) {
      await ctx.db.patch(existing._id, { recordingToken });
    } else if (recordingToken) {
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
