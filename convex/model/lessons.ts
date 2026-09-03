import { ConvexError, type Infer, v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_BULK_LESSONS } from "../../lib/bulk-lessons";

export const lessonDraftValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
});

export type LessonDraft = Infer<typeof lessonDraftValidator>;

export function normalizeLessonDrafts(lessons: LessonDraft[]) {
  if (lessons.length > MAX_BULK_LESSONS) {
    throw new ConvexError("INVALID_LESSON_BATCH");
  }

  return lessons.map((lesson) => {
    const title = lesson.title.trim();
    if (!title) throw new ConvexError("INVALID_LESSON_TITLE");
    return {
      title,
      description: lesson.description?.trim() || undefined,
      content: lesson.content?.trim() || undefined,
    };
  });
}

export async function insertLessonBatch(
  ctx: MutationCtx,
  args: {
    curriculumId: Id<"curriculums">;
    createdBy: Id<"users">;
    lessons: LessonDraft[];
    startingOrder?: number;
  },
) {
  const normalizedLessons = normalizeLessonDrafts(args.lessons);
  const createdAt = Date.now();

  return await Promise.all(
    normalizedLessons.map((lesson, index) =>
      ctx.db.insert("lessons", {
        curriculumId: args.curriculumId,
        ...lesson,
        order: (args.startingOrder ?? 0) + index + 1,
        isActive: true,
        createdAt,
        createdBy: args.createdBy,
      }),
    ),
  );
}
