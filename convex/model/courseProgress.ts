import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const courseProgressFields = {
  totalLessons: v.number(),
  taughtLessons: v.number(),
  pendingLessons: v.number(),
  percentage: v.number(),
};

// Call only after authorizing access to the course or enrolled student profile.
export async function getClassCurriculumProgress(
  ctx: QueryCtx,
  classData: Doc<"classes">,
) {
  const [lessons, reports, reportLessons] = await Promise.all([
    ctx.db
      .query("lessons")
      .withIndex("by_curriculum_active", (q) =>
        q.eq("curriculumId", classData.curriculumId).eq("isActive", true),
      )
      .collect(),
    ctx.db
      .query("classSessionReports")
      .withIndex("by_class_and_closed_at", (q) =>
        q.eq("classId", classData._id),
      )
      .collect(),
    ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_class_and_lesson", (q) => q.eq("classId", classData._id))
      .collect(),
  ]);
  const closedAtByReport = new Map(
    reports.map((report) => [report._id, report.closedAt]),
  );
  const historyByLesson = new Map<
    Id<"lessons">,
    { count: number; lastTaughtAt: number }
  >();
  for (const reportLesson of reportLessons) {
    const closedAt = closedAtByReport.get(reportLesson.reportId);
    if (closedAt === undefined) continue;
    const history = historyByLesson.get(reportLesson.lessonId) ?? {
      count: 0,
      lastTaughtAt: 0,
    };
    history.count += 1;
    history.lastTaughtAt = Math.max(history.lastTaughtAt, closedAt);
    historyByLesson.set(reportLesson.lessonId, history);
  }
  const lessonsWithProgress = lessons
    .sort((a, b) => a.order - b.order)
    .map((lesson) => {
      const history = historyByLesson.get(lesson._id);
      return {
        ...lesson,
        sessionCount: history?.count ?? 0,
        lastTaughtAt: history?.lastTaughtAt,
        status: history ? ("taught" as const) : ("pending" as const),
      };
    });
  const taughtLessons = lessonsWithProgress.filter(
    (lesson) => lesson.status === "taught",
  ).length;
  const totalLessons = lessonsWithProgress.length;
  return {
    totalLessons,
    taughtLessons,
    pendingLessons: totalLessons - taughtLessons,
    percentage:
      totalLessons === 0 ? 0 : Math.round((taughtLessons / totalLessons) * 100),
    lessons: lessonsWithProgress,
  };
}
