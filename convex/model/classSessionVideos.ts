import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessClass, canManageClass } from "../permissions";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "../users";
import { isCourseTeacher } from "./courseAssignments";
import { isExternalClassSession } from "../../lib/class-session";
import { recordPublishedVideoLessons } from "./sessionVideoLessons";

export async function getSessionVideoManager(
  ctx: QueryCtx | MutationCtx,
  scheduleId: Id<"classSchedule">,
) {
  const user = await getCurrentUserFromAuth(ctx);
  const schedule = await ctx.db.get("classSchedule", scheduleId);
  const course = schedule && (await ctx.db.get("classes", schedule.classId));
  if (
    !schedule ||
    !course?.isActive ||
    !user?.isActive ||
    !(
      isCourseTeacher(course, user._id) ||
      (await canManageClass(ctx, user._id, course))
    )
  )
    return null;
  return { user, schedule, course };
}

export async function requireSessionVideoManager(
  ctx: QueryCtx | MutationCtx,
  scheduleId: Id<"classSchedule">,
) {
  const access = await getSessionVideoManager(ctx, scheduleId);
  if (!access) throw new ConvexError("PERMISSION_DENIED");
  const { schedule } = access;
  if (
    schedule.status === "cancelled" ||
    isExternalClassSession(schedule.sessionType)
  )
    throw new ConvexError("SESSION_VIDEO_UNAVAILABLE");
  return access;
}

export async function retireSessionVideo(
  ctx: MutationCtx,
  video: Doc<"classSessionVideos">,
) {
  await ctx.db.patch(video._id, { state: "retired", expiresAt: undefined });
  await ctx.scheduler.runAfter(0, internal.classSessionVideoStorage.cleanup, {
    id: video._id,
  });
}

export async function retireScheduleVideos(
  ctx: MutationCtx,
  scheduleId: Id<"classSchedule">,
) {
  const batches = await Promise.all(
    (["uploading", "ready"] as const).map((state) =>
      ctx.db
        .query("classSessionVideos")
        .withIndex("by_scheduleId_and_state", (q) =>
          q.eq("scheduleId", scheduleId).eq("state", state),
        )
        .take(50),
    ),
  );
  const batch = batches.flat();
  for (const video of batch) await retireSessionVideo(ctx, video);
  // Retired rows already have cleanup jobs and must not block later active uploads.
  if (batches.some((items) => items.length === 50))
    await ctx.scheduler.runAfter(
      60_000,
      internal.classSessionVideos.retireDeletedSchedule,
      { scheduleId },
    );
}

export function hasReleasedSessionVideo(schedule: Doc<"classSchedule">) {
  return Boolean(
    schedule.prerecordedVideoId &&
      schedule.prerecordedVideoReleased &&
      schedule.status !== "cancelled" &&
      !isExternalClassSession(schedule.sessionType),
  );
}

export function getSessionVideoFlags(
  schedule: Doc<"classSchedule">,
  canManage: boolean,
  active: boolean,
) {
  const available =
    active &&
    schedule.status !== "cancelled" &&
    !isExternalClassSession(schedule.sessionType);
  return {
    canManagePrerecorded: available && canManage,
    hasPrerecorded: Boolean(
      available &&
        schedule.prerecordedVideoId &&
        (canManage || hasReleasedSessionVideo(schedule)),
    ),
  };
}

export async function syncPrerecordedRelease(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  if (!schedule.prerecordedVideoId) return;
  const [video, course] = await Promise.all([
    ctx.db.get("classSessionVideos", schedule.prerecordedVideoId),
    ctx.db.get("classes", schedule.classId),
  ]);
  const canPublish = Boolean(
    course?.isActive &&
      video?.state === "ready" &&
      video.scheduleId === schedule._id &&
      schedule.status !== "cancelled" &&
      !isExternalClassSession(schedule.sessionType),
  );
  const released = canPublish && schedule.scheduledStart <= Date.now();
  if (schedule.prerecordedVideoReleased !== released)
    await ctx.db.patch(schedule._id, { prerecordedVideoReleased: released });
  if (released && video && course)
    await recordPublishedVideoLessons(ctx, schedule, video, course);
  if (canPublish && !released && video)
    await ctx.scheduler.runAt(
      schedule.scheduledStart,
      internal.classSessionVideos.publish,
      {
        id: video._id,
        scheduledStart: schedule.scheduledStart,
      },
    );
}

export async function getPublishedSessionVideo(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  const schedule = await ctx.db.get("classSchedule", scheduleId);
  if (!schedule?.prerecordedVideoId || !hasReleasedSessionVideo(schedule))
    return null;
  const [video, course] = await Promise.all([
    ctx.db.get("classSessionVideos", schedule.prerecordedVideoId),
    ctx.db.get("classes", schedule.classId),
  ]);
  if (
    video?.state !== "ready" ||
    video.scheduleId !== scheduleId ||
    !course?.isActive
  )
    return null;
  return {
    _id: video._id,
    name: video.name,
    durationMs: video.durationMs,
    createdAt: video.createdAt,
  };
}

export async function getSessionVideoReadAccess(
  ctx: QueryCtx,
  id: Id<"classSessionVideos">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const video = await ctx.db.get("classSessionVideos", id);
  const schedule =
    video && (await ctx.db.get("classSchedule", video.scheduleId));
  const course = schedule && (await ctx.db.get("classes", schedule.classId));
  if (
    !user.isActive ||
    !video ||
    video.state !== "ready" ||
    !schedule ||
    !course?.isActive ||
    schedule.prerecordedVideoId !== id ||
    schedule.status === "cancelled" ||
    isExternalClassSession(schedule.sessionType) ||
    !(await canAccessClass(ctx, user._id, course))
  )
    throw new ConvexError("PERMISSION_DENIED");
  const canPreview =
    isCourseTeacher(course, user._id) ||
    (await canManageClass(ctx, user._id, course));
  return { video, schedule, canPreview };
}
