import { ConvexError, v } from "convex/values";
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { components, internal } from "./_generated/api";
import { query } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getSessionVideoReadAccess,
  hasReleasedSessionVideo,
} from "./model/classSessionVideos";
import { isStudentEnrolled } from "./model/enrollments";
import { canAccessClass } from "./permissions";
import {
  resolveStudentDashboardAccess,
  studentDashboardTargetValidator,
} from "./model/studentDashboardAccess";
import {
  coverageSize,
  mergeCoverage,
  validCoverage,
  validVideoDuration,
  watchedMilliseconds,
} from "../lib/video-progress";

const limiter = new RateLimiter(components.rateLimiter, {
  checkpoints: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 24 },
  durationByVideo: {
    kind: "token bucket",
    rate: 2,
    period: MINUTE,
    capacity: 1,
  },
  durationByStudent: {
    kind: "token bucket",
    rate: 4,
    period: MINUTE,
    capacity: 2,
  },
});

const reportRow = v.object({
  videoId: v.id("classSessionVideos"),
  scheduledStart: v.number(),
  name: v.string(),
  percentage: v.union(v.number(), v.null()),
  lastProgressAt: v.union(v.number(), v.null()),
});

export const courseReport = query({
  args: {
    ...studentDashboardTargetValidator.fields,
    classId: v.id("classes"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(reportRow),
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 50
    )
      throw new ConvexError("INVALID_PAGE_SIZE");
    const access = await resolveStudentDashboardAccess(ctx, args);
    const course = await ctx.db.get(args.classId);
    if (
      !access?.viewer.isActive ||
      !access.student.isActive ||
      !course?.isActive ||
      (access.campus && course.campusId !== access.campus._id) ||
      !(await isStudentEnrolled(ctx, course, access.student._id)) ||
      !(await canAccessClass(ctx, access.viewer._id, course))
    )
      return { page: [], isDone: true, continueCursor: "" };
    const schedules = await ctx.db
      .query("classSchedule")
      .withIndex(
        "by_classId_and_prerecordedVideoReleased_and_scheduledStart",
        (q) => q.eq("classId", course._id).eq("prerecordedVideoReleased", true),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const rows = await Promise.all(
      schedules.page.map(async (schedule) => {
        if (!hasReleasedSessionVideo(schedule) || !schedule.prerecordedVideoId)
          return null;
        const video = await ctx.db.get(schedule.prerecordedVideoId);
        if (video?.state !== "ready" || video.scheduleId !== schedule._id)
          return null;
        const progress = await ctx.db
          .query("videoViewingProgress")
          .withIndex("by_videoId_and_studentId", (q) =>
            q.eq("videoId", video._id).eq("studentId", access.student._id),
          )
          .unique();
        const durationMs =
          progress?.durationMs ?? video.verifiedDurationMs ?? null;
        const watchedMs = progress?.watchedMs ?? 0;
        return {
          videoId: video._id,
          scheduledStart: schedule.scheduledStart,
          name: video.name,
          percentage:
            durationMs === null
              ? null
              : Math.min(100, (100 * watchedMs) / durationMs),
          lastProgressAt: watchedMs > 0 ? progress!.updatedAt : null,
        };
      }),
    );
    return { ...schedules, page: rows.filter((row) => row !== null) };
  },
});

async function requireBudget(
  ctx: MutationCtx,
  name: "checkpoints" | "durationByVideo" | "durationByStudent",
  key: string,
) {
  const result = await limiter.limit(ctx, name, { key });
  if (!result.ok)
    throw new ConvexError({
      code: "VIDEO_PROGRESS_RATE_LIMITED",
      retryAfter: result.retryAfter,
    });
}

async function learnerAccess(
  ctx: QueryCtx | MutationCtx,
  id: Id<"classSessionVideos">,
) {
  const access = await getSessionVideoReadAccess(ctx, id);
  if (
    access.canPreview ||
    !access.schedule.prerecordedVideoReleased ||
    !(await isStudentEnrolled(ctx, access.course, access.user._id))
  )
    throw new ConvexError("PERMISSION_DENIED");
  return access;
}

export const context = internalMutation({
  args: { videoId: v.id("classSessionVideos") },
  returns: v.object({
    bucket: v.string(),
    size: v.number(),
    scheduledStart: v.number(),
    verifiedDurationMs: v.optional(v.number()),
  }),
  handler: async (ctx, { videoId }) => {
    const { user, video, schedule } = await learnerAccess(ctx, videoId);
    if (schedule.scheduledStart > Date.now())
      throw new ConvexError("PERMISSION_DENIED");
    if (video.verifiedDurationMs === undefined) {
      if (video.progressDurationUnavailable)
        throw new ConvexError("VIDEO_PROGRESS_DURATION_UNAVAILABLE");
      await requireBudget(ctx, "durationByStudent", user._id);
      await requireBudget(ctx, "durationByVideo", videoId);
    }
    return {
      bucket: video.bucket,
      size: video.size,
      scheduledStart: schedule.scheduledStart,
      verifiedDurationMs: video.verifiedDurationMs,
    };
  },
});

export const markDurationUnavailable = internalMutation({
  args: { videoId: v.id("classSessionVideos") },
  returns: v.null(),
  handler: async (ctx, { videoId }) => {
    const { video } = await learnerAccess(ctx, videoId);
    if (
      video.verifiedDurationMs === undefined &&
      !video.progressDurationUnavailable
    )
      await ctx.db.patch(videoId, { progressDurationUnavailable: true });
    return null;
  },
});

export const initialize = internalMutation({
  args: { videoId: v.id("classSessionVideos"), durationMs: v.number() },
  returns: v.object({
    id: v.id("videoViewingProgress"),
    durationMs: v.number(),
    coverage: v.bytes(),
  }),
  handler: async (ctx, { videoId, durationMs }) => {
    const { user, video, schedule } = await learnerAccess(ctx, videoId);
    if (schedule.scheduledStart > Date.now())
      throw new ConvexError("PERMISSION_DENIED");
    if (!validVideoDuration(durationMs))
      throw new ConvexError("INVALID_VIDEO_DURATION");
    const duration = video.verifiedDurationMs ?? durationMs;
    if (video.verifiedDurationMs === undefined)
      await ctx.db.patch(videoId, { verifiedDurationMs: duration });
    const existing = await ctx.db
      .query("videoViewingProgress")
      .withIndex("by_videoId_and_studentId", (q) =>
        q.eq("videoId", videoId).eq("studentId", user._id),
      )
      .unique();
    if (existing)
      return {
        id: existing._id,
        durationMs: duration,
        coverage: existing.coverage,
      };
    const coverage = new ArrayBuffer(coverageSize(duration));
    const id = await ctx.db.insert("videoViewingProgress", {
      videoId,
      studentId: user._id,
      durationMs: duration,
      coverage,
      watchedMs: 0,
      updatedAt: Date.now(),
    });
    return { id, durationMs: duration, coverage };
  },
});

export const record = mutation({
  args: { id: v.id("videoViewingProgress"), coverage: v.bytes() },
  returns: v.object({ coverage: v.bytes(), watchedMs: v.number() }),
  handler: async (ctx, { id, coverage }) => {
    const progress = await ctx.db.get(id);
    if (!progress) throw new ConvexError("VIDEO_PROGRESS_UNAVAILABLE");
    const { user, schedule } = await learnerAccess(ctx, progress.videoId);
    if (user._id !== progress.studentId || schedule.scheduledStart > Date.now())
      throw new ConvexError("PERMISSION_DENIED");
    const incoming = new Uint8Array(coverage);
    if (!validCoverage(incoming, progress.durationMs))
      throw new ConvexError("INVALID_VIDEO_COVERAGE");
    await requireBudget(ctx, "checkpoints", user._id);
    const merged = mergeCoverage(new Uint8Array(progress.coverage), incoming);
    const watchedMs = watchedMilliseconds(merged, progress.durationMs);
    if (watchedMs !== progress.watchedMs)
      await ctx.db.patch(id, {
        coverage: merged.buffer,
        watchedMs,
        updatedAt: Date.now(),
      });
    return { coverage: merged.buffer, watchedMs };
  },
});

export const cleanup = internalMutation({
  args: { videoId: v.id("classSessionVideos") },
  returns: v.null(),
  handler: async (ctx, { videoId }) => {
    const video = await ctx.db.get(videoId);
    if (video && video.state !== "retired") return null;
    const batch = await ctx.db
      .query("videoViewingProgress")
      .withIndex("by_videoId_and_studentId", (q) => q.eq("videoId", videoId))
      .take(100);
    for (const row of batch) await ctx.db.delete(row._id);
    if (batch.length === 100)
      await ctx.scheduler.runAfter(0, internal.videoViewingProgress.cleanup, {
        videoId,
      });
    return null;
  },
});
