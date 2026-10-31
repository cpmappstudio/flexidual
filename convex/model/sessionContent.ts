import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";
import {
  getPublishedSessionVideo,
  hasReleasedSessionVideo,
} from "./classSessionVideos";

const RECORDING_PART_LIMIT = 10;
const LESSON_PREVIEW_LIMIT = 2;

async function listPlayableRecordingDocuments(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
  preview = false,
) {
  const recordings = ctx.db
    .query("recordings")
    .withIndex("by_schedule", (q) =>
      q.eq("scheduleId", scheduleId).eq("status", "complete"),
    );
  return (
    await (preview
      ? recordings.take(RECORDING_PART_LIMIT)
      : recordings.collect())
  )
    .filter((recording): recording is typeof recording & { url: string } =>
      Boolean(recording.url),
    )
    .sort((first, second) => first.startedAt - second.startedAt);
}

export const playbackPartValidator = v.object({
  _id: v.union(v.id("recordings"), v.id("classSessionVideos")),
  url: v.union(v.string(), v.null()),
  durationMs: v.union(v.number(), v.null()),
  startedAt: v.number(),
  prerecordedVideoId: v.optional(v.id("classSessionVideos")),
});

export async function getPlayableRecordings(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
  includePrerecorded: boolean,
): Promise<Infer<typeof playbackPartValidator>[]> {
  const [recordings, uploaded] = await Promise.all([
    listPlayableRecordingDocuments(ctx, scheduleId),
    includePrerecorded ? getPublishedSessionVideo(ctx, scheduleId) : null,
  ]);
  const liveParts = recordings.map((recording) => ({
    _id: recording._id,
    url: recording.url,
    durationMs: recording.durationMs ?? null,
    startedAt: recording.startedAt,
  }));
  return uploaded
    ? [
        {
          _id: uploaded._id,
          url: null,
          durationMs: uploaded.durationMs,
          startedAt: uploaded.createdAt,
          prerecordedVideoId: uploaded._id,
        },
        ...liveParts,
      ]
    : liveParts;
}

export async function getSessionLessonDetails(
  ctx: QueryCtx,
  records: readonly { lessonId: Id<"lessons"> }[],
) {
  const lessonIds = [...new Set(records.map(({ lessonId }) => lessonId))];
  const lessons = await Promise.all(
    lessonIds.map((id) => ctx.db.get("lessons", id)),
  );
  return lessons
    .filter((lesson) => lesson !== null)
    .sort((first, second) => first.order - second.order)
    .map((lesson) => ({
      lessonId: lesson._id,
      title: lesson.title,
      order: lesson.order,
    }));
}

export async function getSessionContentSummary(
  ctx: QueryCtx,
  schedule: Doc<"classSchedule">,
) {
  const scheduleId = schedule._id;
  const [reportLessons, prerecordedLessons, recordings] = await Promise.all([
    ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
      .take(LESSON_PREVIEW_LIMIT),
    ctx.db
      .query("classPrerecordedLessonRecords")
      .withIndex("by_scheduleId_and_lessonId", (q) =>
        q.eq("scheduleId", scheduleId),
      )
      .take(LESSON_PREVIEW_LIMIT),
    listPlayableRecordingDocuments(ctx, scheduleId, true),
  ]);
  const lessonRecords = [...reportLessons, ...prerecordedLessons];
  const lessons = await getSessionLessonDetails(ctx, lessonRecords);
  const lesson = lessons[0];

  return {
    lessonPreview: lesson ? { title: lesson.title, order: lesson.order } : null,
    hasMoreLessons:
      new Set(lessonRecords.map(({ lessonId }) => lessonId)).size > 1,
    recordingCount:
      recordings.length + Number(hasReleasedSessionVideo(schedule)),
  };
}
