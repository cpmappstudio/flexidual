import { ConvexError, v } from "convex/values";
import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components, internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getSessionVideoReadAccess,
  getSessionVideoManager,
  requireSessionVideoManager,
  retireScheduleVideos,
  retireSessionVideo,
  syncPrerecordedRelease,
} from "./model/classSessionVideos";
import { getCurrentUserOrThrow } from "./users";
import { classSessionVideoFields } from "./model/classSessionVideoFields";
import { validateSessionVideoLessons } from "./model/sessionVideoLessons";
import { getCourseLessonHistory } from "./model/courseProgress";
import { getClassTimeZone } from "./model/timeZone";
import { isExternalClassSession } from "../lib/class-session";
import {
  MAX_SESSION_VIDEO_BYTES,
  SESSION_VIDEO_CLEANUP_GRACE_MS,
  SESSION_VIDEO_UPLOAD_TTL_MS,
  validSessionVideo,
} from "../lib/class-session-video";

const limiter = new RateLimiter(components.rateLimiter, {
  uploads: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 10 },
  bytes: {
    kind: "token bucket",
    rate: 4 * MAX_SESSION_VIDEO_BYTES,
    period: HOUR,
    capacity: 4 * MAX_SESSION_VIDEO_BYTES,
  },
});
const videoMetadata = classSessionVideoFields.pick(
  "name",
  "contentType",
  "size",
  "durationMs",
  "lessonIds",
);
const videoDocument = classSessionVideoFields.extend({
  _id: v.id("classSessionVideos"),
  _creationTime: v.number(),
});
const managerVideoMetadata = v.object({
  id: v.id("classSessionVideos"),
  name: v.string(),
  durationMs: v.number(),
  released: v.boolean(),
  scheduledStart: v.number(),
  lessonIds: v.optional(v.array(v.id("lessons"))),
});

export const getManagementContext = query({
  args: { scheduleId: v.id("classSchedule") },
  returns: v.union(
    v.null(),
    v.object({
      scheduledStart: v.number(),
      timeZone: v.union(v.string(), v.null()),
      video: v.union(managerVideoMetadata, v.null()),
      lessons: v.array(
        v.object({
          lessonId: v.id("lessons"),
          title: v.string(),
          order: v.number(),
          selected: v.boolean(),
          previousSessionCount: v.number(),
          lastRecordedAt: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { scheduleId }) => {
    const access = await getSessionVideoManager(ctx, scheduleId);
    if (
      !access ||
      access.schedule.status === "cancelled" ||
      isExternalClassSession(access.schedule.sessionType)
    )
      return null;
    const { schedule, course } = access;
    const [video, lessons, history, timeZone] = await Promise.all([
      schedule.prerecordedVideoId
        ? ctx.db.get("classSessionVideos", schedule.prerecordedVideoId)
        : null,
      ctx.db
        .query("lessons")
        .withIndex("by_curriculum_active", (q) =>
          q.eq("curriculumId", course.curriculumId).eq("isActive", true),
        )
        .collect(),
      getCourseLessonHistory(ctx, course._id, schedule._id),
      getClassTimeZone(ctx, course),
    ]);
    const ready =
      video?.state === "ready" && video.scheduleId === schedule._id
        ? video
        : null;
    const selected = new Set(ready?.lessonIds ?? []);
    return {
      scheduledStart: schedule.scheduledStart,
      timeZone: timeZone ?? null,
      video: ready
        ? {
            id: ready._id,
            name: ready.name,
            durationMs: ready.durationMs,
            released: schedule.prerecordedVideoReleased === true,
            scheduledStart: schedule.scheduledStart,
            lessonIds: ready.lessonIds,
          }
        : null,
      lessons: lessons
        .sort((a, b) => a.order - b.order)
        .map((lesson) => ({
          lessonId: lesson._id,
          title: lesson.title,
          order: lesson.order,
          selected: selected.has(lesson._id),
          previousSessionCount: history.get(lesson._id)?.count ?? 0,
          lastRecordedAt: history.get(lesson._id)?.lastRecordedAt,
        })),
    };
  },
});

export const reserve = internalMutation({
  args: {
    scheduleId: v.id("classSchedule"),
    bucket: v.string(),
    ...videoMetadata.fields,
  },
  returns: v.id("classSessionVideos"),
  handler: async (ctx, args) => {
    const { user, schedule, course } = await requireSessionVideoManager(
      ctx,
      args.scheduleId,
    );
    if (!validSessionVideo(args))
      throw new ConvexError("INVALID_SESSION_VIDEO");
    await validateSessionVideoLessons(ctx, course.curriculumId, args.lessonIds);
    await limiter.limit(ctx, "uploads", { key: user._id, throws: true });
    await limiter.limit(ctx, "bytes", {
      key: user._id,
      count: args.size,
      throws: true,
    });
    const expiresAt = Date.now() + SESSION_VIDEO_UPLOAD_TTL_MS;
    const id = await ctx.db.insert("classSessionVideos", {
      ...args,
      classId: course._id,
      uploadedBy: user._id,
      state: "uploading",
      createdAt: Date.now(),
      expectedVideoId: schedule.prerecordedVideoId,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.classSessionVideos.expire, {
      id,
      bucket: args.bucket,
    });
    return id;
  },
});

export const uploadContext = internalQuery({
  args: { id: v.id("classSessionVideos") },
  returns: videoDocument,
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get("classSessionVideos", id);
    if (!video || video.uploadedBy !== user._id || video.state === "retired")
      throw new ConvexError("PERMISSION_DENIED");
    await requireSessionVideoManager(ctx, video.scheduleId);
    return video;
  },
});

export const attachUpload = internalMutation({
  args: { id: v.id("classSessionVideos"), uploadId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { id, uploadId }) => {
    const video = await ctx.db.get("classSessionVideos", id);
    if (!video) return false;
    await ctx.db.patch(id, { uploadId });
    if (video.state !== "uploading" || (video.expiresAt ?? 0) <= Date.now()) {
      await retireSessionVideo(ctx, { ...video, uploadId });
      return false;
    }
    return true;
  },
});

export const commit = internalMutation({
  args: { id: v.id("classSessionVideos") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const video = await ctx.db.get("classSessionVideos", id);
    if (!video || video.uploadedBy !== user._id)
      throw new ConvexError("PERMISSION_DENIED");
    const { schedule, course } = await requireSessionVideoManager(
      ctx,
      video.scheduleId,
    );
    if (video.state === "ready" && schedule.prerecordedVideoId === id)
      return null;
    if (video.state !== "uploading" || (video.expiresAt ?? 0) <= Date.now())
      throw new ConvexError("SESSION_VIDEO_UPLOAD_EXPIRED");
    if (schedule.prerecordedVideoId !== video.expectedVideoId)
      throw new ConvexError("SESSION_VIDEO_CONFLICT");
    await validateSessionVideoLessons(
      ctx,
      course.curriculumId,
      video.lessonIds,
    );
    const previous = schedule.prerecordedVideoId
      ? await ctx.db.get("classSessionVideos", schedule.prerecordedVideoId)
      : null;
    await ctx.db.patch(id, { state: "ready", expiresAt: undefined });
    await ctx.db.patch(schedule._id, { prerecordedVideoId: id });
    await syncPrerecordedRelease(ctx, { ...schedule, prerecordedVideoId: id });
    if (previous) await retireSessionVideo(ctx, previous);
    return null;
  },
});

async function cancelOwnUpload(
  ctx: MutationCtx,
  { id }: { id: Id<"classSessionVideos"> },
) {
  const user = await getCurrentUserOrThrow(ctx);
  const video = await ctx.db.get("classSessionVideos", id);
  if (video?.uploadedBy === user._id && video.state === "uploading")
    await retireSessionVideo(ctx, video);
  return null;
}
const cancelDefinition = {
  args: { id: v.id("classSessionVideos") },
  returns: v.null(),
  handler: cancelOwnUpload,
};
export const cancel = mutation(cancelDefinition);
export const cancelUpload = internalMutation(cancelDefinition);

export const remove = mutation({
  args: {
    scheduleId: v.id("classSchedule"),
    expectedVideoId: v.id("classSessionVideos"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { schedule } = await requireSessionVideoManager(ctx, args.scheduleId);
    if (schedule.prerecordedVideoId !== args.expectedVideoId)
      throw new ConvexError("SESSION_VIDEO_CONFLICT");
    const video = await ctx.db.get("classSessionVideos", args.expectedVideoId);
    await ctx.db.patch(schedule._id, {
      prerecordedVideoId: undefined,
      prerecordedVideoReleased: undefined,
    });
    if (video) await retireSessionVideo(ctx, video);
    return null;
  },
});

export const publish = internalMutation({
  args: { id: v.id("classSessionVideos"), scheduledStart: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, scheduledStart }) => {
    const video = await ctx.db.get("classSessionVideos", id);
    const schedule =
      video && (await ctx.db.get("classSchedule", video.scheduleId));
    if (
      schedule?.prerecordedVideoId === id &&
      schedule.scheduledStart === scheduledStart
    )
      await syncPrerecordedRelease(ctx, schedule);
    return null;
  },
});

export const expire = internalMutation({
  args: { id: v.id("classSessionVideos"), bucket: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, bucket }) => {
    const video = await ctx.db.get("classSessionVideos", id);
    if (video?.state === "ready") return null;
    if (video?.state === "uploading" && (video.expiresAt ?? 0) > Date.now())
      return null;
    if (video?.state === "uploading" && (video.expiresAt ?? 0) <= Date.now())
      await retireSessionVideo(ctx, video);
    // The original reservation survives deleted metadata and an interrupted completion action.
    if (bucket)
      await ctx.scheduler.runAfter(
        SESSION_VIDEO_CLEANUP_GRACE_MS,
        internal.classSessionVideoStorage.cleanup,
        { id, bucket },
      );
    return null;
  },
});

export const retireDeletedSchedule = internalMutation({
  args: { scheduleId: v.id("classSchedule") },
  returns: v.null(),
  handler: async (ctx, { scheduleId }) => {
    if (!(await ctx.db.get("classSchedule", scheduleId)))
      await retireScheduleVideos(ctx, scheduleId);
    return null;
  },
});

export const cleanupContext = internalQuery({
  args: { id: v.id("classSessionVideos") },
  returns: v.union(videoDocument, v.null()),
  handler: async (ctx, { id }) => {
    return await ctx.db.get("classSessionVideos", id);
  },
});
export const finishCleanup = internalMutation({
  args: { id: v.id("classSessionVideos") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if ((await ctx.db.get("classSessionVideos", id))?.state === "retired")
      await ctx.db.delete(id);
    return null;
  },
});

export const playbackContext = internalQuery({
  args: { id: v.id("classSessionVideos") },
  returns: v.object({
    bucket: v.string(),
    keyId: v.id("classSessionVideos"),
    scheduledStart: v.number(),
    canPreview: v.boolean(),
    released: v.boolean(),
  }),
  handler: async (ctx, { id }) => {
    const { video, schedule, canPreview } = await getSessionVideoReadAccess(
      ctx,
      id,
    );
    return {
      bucket: video.bucket,
      keyId: id,
      scheduledStart: schedule.scheduledStart,
      canPreview,
      released: schedule.prerecordedVideoReleased === true,
    };
  },
});

export const getForSchedule = query({
  args: { scheduleId: v.id("classSchedule") },
  returns: v.union(
    v.object({
      id: v.id("classSessionVideos"),
      name: v.string(),
      durationMs: v.number(),
      released: v.boolean(),
      scheduledStart: v.number(),
      lessonIds: v.optional(v.array(v.id("lessons"))),
    }),
    v.null(),
  ),
  handler: async (ctx, { scheduleId }) => {
    const schedule = await ctx.db.get("classSchedule", scheduleId);
    if (!schedule?.prerecordedVideoId) return null;
    const access = await getSessionVideoReadAccess(
      ctx,
      schedule.prerecordedVideoId,
    );
    if (!access.canPreview && !schedule.prerecordedVideoReleased) return null;
    return {
      id: access.video._id,
      name: access.video.name,
      durationMs: access.video.durationMs,
      released: schedule.prerecordedVideoReleased === true,
      scheduledStart: schedule.scheduledStart,
      lessonIds: access.video.lessonIds,
    };
  },
});
