import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const RECORDING_PART_LIMIT = 10;
const LESSON_PREVIEW_LIMIT = 2;

async function listPlayableRecordingDocuments(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  return (
    await ctx.db
      .query("recordings")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", scheduleId).eq("status", "complete"),
      )
      .take(RECORDING_PART_LIMIT)
  )
    .filter((recording): recording is typeof recording & { url: string } =>
      Boolean(recording.url),
    )
    .sort((first, second) => first.startedAt - second.startedAt);
}

export async function getPlayableRecordings(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  return (await listPlayableRecordingDocuments(ctx, scheduleId)).map(
    (recording) => ({
      _id: recording._id,
      url: recording.url,
      durationMs: recording.durationMs ?? null,
      startedAt: recording.startedAt,
    }),
  );
}

export async function getSessionContentSummary(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  const [reportLessons, recordings] = await Promise.all([
    ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", scheduleId))
      .take(LESSON_PREVIEW_LIMIT),
    listPlayableRecordingDocuments(ctx, scheduleId),
  ]);
  const lessons = (
    await Promise.all(
      reportLessons.map(({ lessonId }) => ctx.db.get("lessons", lessonId)),
    )
  )
    .filter((lesson) => lesson !== null)
    .sort((first, second) => first.order - second.order);
  const lesson = lessons[0];

  return {
    lessonPreview: lesson ? { title: lesson.title, order: lesson.order } : null,
    hasMoreLessons: reportLessons.length > 1,
    recordingCount: recordings.length,
  };
}
