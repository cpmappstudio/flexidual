import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const SESSION_VIDEO_LESSON_LIMIT = 500;

export async function getPrerecordedLessonRecords(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  return await ctx.db
    .query("classPrerecordedLessonRecords")
    .withIndex("by_scheduleId_and_lessonId", (q) =>
      q.eq("scheduleId", scheduleId),
    )
    .collect();
}

export async function validateSessionVideoLessons(
  ctx: QueryCtx | MutationCtx,
  curriculumId: Id<"curriculums">,
  lessonIds: Id<"lessons">[] | undefined,
) {
  if (lessonIds === undefined) return;
  if (
    lessonIds.length > SESSION_VIDEO_LESSON_LIMIT ||
    new Set(lessonIds).size !== lessonIds.length
  )
    throw new ConvexError("INVALID_TAUGHT_LESSON_SELECTION");
  const lessons = await Promise.all(
    lessonIds.map((id) => ctx.db.get("lessons", id)),
  );
  if (
    lessons.some(
      (lesson) => !lesson?.isActive || lesson.curriculumId !== curriculumId,
    )
  )
    throw new ConvexError("INVALID_TAUGHT_LESSON_SELECTION");
}

export async function recordPublishedVideoLessons(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
  video: Doc<"classSessionVideos">,
  course: Doc<"classes">,
) {
  if (
    !course.isActive ||
    !video.lessonIds?.length ||
    video.lessonsRecordedAt !== undefined
  )
    return;
  const now = Date.now();
  for (const lessonId of video.lessonIds) {
    const lesson = await ctx.db.get("lessons", lessonId);
    // A curriculum may change while an upload waits for its scheduled release.
    if (!lesson?.isActive || lesson.curriculumId !== course.curriculumId)
      continue;
    const existing = await ctx.db
      .query("classPrerecordedLessonRecords")
      .withIndex("by_scheduleId_and_lessonId", (q) =>
        q.eq("scheduleId", schedule._id).eq("lessonId", lessonId),
      )
      .unique();
    if (!existing)
      await ctx.db.insert("classPrerecordedLessonRecords", {
        classId: course._id,
        scheduleId: schedule._id,
        lessonId,
        taughtAt: now,
      });
  }
  await ctx.db.patch(video._id, { lessonsRecordedAt: now });
}
